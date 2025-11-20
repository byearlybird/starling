# Query System Examples

## Basic Single-Collection Query

```typescript
import { createDatabase } from "@byearlybird/starling-db";
import { createQuery } from "@byearlybird/starling-db/query";

const db = await createDatabase({
  schema: {
    todos: { schema: todoSchema, getId: (t) => t.id }
  }
}).init();

// Simple filter
const activeTodos = createQuery(db, "todos", (todo) => !todo.completed);

// With mapping
const todoTexts = createQuery(
  db,
  "todos",
  (todo) => !todo.completed,
  { map: (todo) => todo.text }
);

// With sorting
const sortedTodos = createQuery(
  db,
  "todos",
  (todo) => !todo.completed,
  {
    map: (todo) => ({ id: todo.id, text: todo.text }),
    sort: (a, b) => a.text.localeCompare(b.text)
  }
);
```

---

## Multi-Collection Join

```typescript
const db = await createDatabase({
  schema: {
    todos: { schema: todoSchema, getId: (t) => t.id },
    users: { schema: userSchema, getId: (u) => u.id }
  }
}).init();

// Simple join
const todosWithOwners = createQuery(db, (collections) => {
  const results = [];
  const todos = collections.todos.find(t => !t.completed);
  const users = collections.users.getAll();

  for (const todo of todos) {
    const owner = users.find(u => u.id === todo.ownerId);
    if (owner) {
      results.push({
        id: todo.id,
        text: todo.text,
        ownerName: owner.name,
        ownerEmail: owner.email
      });
    }
  }

  return results;
});

// Use it
console.log(todosWithOwners.results());
todosWithOwners.onChange(() => {
  console.log("Updated:", todosWithOwners.results());
});
```

---

## Advanced: Project Dashboard

```typescript
type Todo = {
  id: string;
  text: string;
  completed: boolean;
  priority: "low" | "medium" | "high";
  ownerId: string;
  projectId: string;
  dueDate: string;
};

type User = {
  id: string;
  name: string;
  email: string;
  active: boolean;
  avatarUrl: string;
};

type Project = {
  id: string;
  name: string;
  color: string;
  archived: boolean;
};

const db = await createDatabase({
  schema: {
    todos: { schema: todoSchema, getId: (t) => t.id },
    users: { schema: userSchema, getId: (u) => u.id },
    projects: { schema: projectSchema, getId: (p) => p.id }
  }
}).init();

// Dashboard query: Active todos with owner + project info, grouped by project
const dashboardQuery = createQuery(db, (collections) => {
  // Get active data
  const todos = collections.todos.find(t => !t.completed);
  const users = collections.users.find(u => u.active);
  const projects = collections.projects.find(p => !p.archived);

  // Build efficient lookup maps
  const userMap = new Map(users.map(u => [u.id, u]));
  const projectMap = new Map(projects.map(p => [p.id, p]));

  // Enrich todos with related data
  const enrichedTodos = todos
    .map(todo => {
      const owner = userMap.get(todo.ownerId);
      const project = projectMap.get(todo.projectId);

      // Skip if missing required relations
      if (!owner || !project) return null;

      return {
        id: todo.id,
        text: todo.text,
        priority: todo.priority,
        dueDate: todo.dueDate,
        owner: {
          id: owner.id,
          name: owner.name,
          avatarUrl: owner.avatarUrl
        },
        project: {
          id: project.id,
          name: project.name,
          color: project.color
        }
      };
    })
    .filter(Boolean);

  // Group by project
  const byProject = new Map<string, typeof enrichedTodos>();
  for (const todo of enrichedTodos) {
    const projectId = todo.project.id;
    if (!byProject.has(projectId)) {
      byProject.set(projectId, []);
    }
    byProject.get(projectId)!.push(todo);
  }

  // Sort todos within each project by priority then due date
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  for (const todos of byProject.values()) {
    todos.sort((a, b) => {
      const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (priorityDiff !== 0) return priorityDiff;
      return a.dueDate.localeCompare(b.dueDate);
    });
  }

  // Convert to final format
  return Array.from(byProject.entries()).map(([projectId, todos]) => ({
    project: todos[0].project,
    todos: todos,
    stats: {
      total: todos.length,
      highPriority: todos.filter(t => t.priority === "high").length,
      dueToday: todos.filter(t => t.dueDate === new Date().toISOString().split('T')[0]).length
    }
  }));
});

// Use in your UI
const dashboard = dashboardQuery.results();
console.log(dashboard);
/*
[
  {
    project: { id: "p1", name: "Website Redesign", color: "#FF5722" },
    todos: [
      { id: "t1", text: "Design homepage", priority: "high", ... },
      { id: "t2", text: "Update footer", priority: "low", ... }
    ],
    stats: { total: 2, highPriority: 1, dueToday: 0 }
  },
  ...
]
*/

// React to any change
dashboardQuery.onChange(() => {
  updateUI(dashboardQuery.results());
});
```

---

## Performance: Efficient Lookups

When joining large collections, use Maps for O(1) lookups:

```typescript
// ❌ Inefficient: O(n*m) nested loops
const todosWithOwners = createQuery(db, (collections) => {
  const todos = collections.todos.getAll();
  const users = collections.users.getAll();

  return todos.map(todo => {
    const owner = users.find(u => u.id === todo.ownerId); // O(n) for each todo
    return { ...todo, ownerName: owner?.name };
  });
});

// ✅ Efficient: O(n+m) with Map
const todosWithOwners = createQuery(db, (collections) => {
  const todos = collections.todos.getAll();
  const users = collections.users.getAll();

  // Build lookup map once
  const userMap = new Map(users.map(u => [u.id, u])); // O(n)

  return todos.map(todo => {
    const owner = userMap.get(todo.ownerId); // O(1)
    return { ...todo, ownerName: owner?.name };
  });
});
```

---

## Selective Collection Access

The query system automatically tracks which collections you access:

```typescript
// This query only subscribes to "todos" mutations
const simpleTodos = createQuery(db, (collections) => {
  return collections.todos.getAll(); // Only accesses todos
});

// This query subscribes to BOTH "todos" and "users" mutations
const enrichedTodos = createQuery(db, (collections) => {
  const todos = collections.todos.getAll(); // Accesses todos
  const userMap = new Map(
    collections.users.getAll().map(u => [u.id, u]) // Accesses users
  );

  return todos.map(todo => ({
    ...todo,
    ownerName: userMap.get(todo.ownerId)?.name
  }));
});
```

This means:
- ✅ Changes to `todos` trigger both queries
- ✅ Changes to `users` only trigger `enrichedTodos`
- ✅ Changes to other collections trigger neither

---

## Computed Properties

Add derived data in your queries:

```typescript
const todosWithMetadata = createQuery(db, (collections) => {
  const now = Date.now();

  return collections.todos.getAll().map(todo => ({
    ...todo,
    isOverdue: new Date(todo.dueDate) < now,
    daysUntilDue: Math.ceil(
      (new Date(todo.dueDate).getTime() - now) / (1000 * 60 * 60 * 24)
    ),
    urgency: calculateUrgency(todo.priority, todo.dueDate)
  }));
});
```

---

## Aggregations

Compute stats across your data:

```typescript
const projectStats = createQuery(db, (collections) => {
  const todos = collections.todos.getAll();
  const projects = collections.projects.getAll();

  return projects.map(project => {
    const projectTodos = todos.filter(t => t.projectId === project.id);

    return {
      projectId: project.id,
      projectName: project.name,
      totalTodos: projectTodos.length,
      completedTodos: projectTodos.filter(t => t.completed).length,
      completionRate: projectTodos.length > 0
        ? (projectTodos.filter(t => t.completed).length / projectTodos.length) * 100
        : 0
    };
  });
});
```

---

## Type Safety

TypeScript fully infers return types:

```typescript
const query = createQuery(db, (collections) => {
  return collections.todos.find(t => !t.completed).map(t => ({
    id: t.id,
    text: t.text.toUpperCase()
  }));
});

// TypeScript knows the exact shape:
const results: Array<{ id: string; text: string }> = query.results();

// Autocomplete works:
results[0].text // ✅
results[0].completed // ❌ Error: Property doesn't exist
```

---

## Testing Queries

Queries are easy to test since they're pure functions:

```typescript
import { describe, it, expect } from "bun:test";

describe("Dashboard Query", () => {
  it("groups todos by project", async () => {
    const db = await createDatabase({ ... }).init();

    // Setup test data
    db.projects.add({ id: "p1", name: "Project 1", ... });
    db.todos.add({ id: "t1", projectId: "p1", ... });
    db.todos.add({ id: "t2", projectId: "p1", ... });

    const dashboard = createQuery(db, (collections) => {
      // ... dashboard logic
    });

    const results = dashboard.results();
    expect(results).toHaveLength(1);
    expect(results[0].todos).toHaveLength(2);

    dashboard.dispose();
  });
});
```
