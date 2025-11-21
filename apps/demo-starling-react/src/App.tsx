import { useState } from "react";
import { Column } from "./column";
import { SearchInput } from "./search-input";
import { db, type TaskInput } from "./store/task-store";

function App() {
        const [searchQuery, setSearchQuery] = useState("");

        const onAdd = () => {
                const title = prompt("New task title");
                if (title === null) return;
                const newTask: TaskInput = { title };
                db.tasks.add(newTask);
        };

        return (
                <div className="max-w-[1100px] mx-auto my-8">
                        <SearchInput
                                query={searchQuery}
                                onQueryChange={setSearchQuery}
                                onAdd={onAdd}
                        />
                        <div className="grid grid-cols-3 gap-6">
                                <Column title="To Do" status="todo" searchQuery={searchQuery} />
                                <Column title="Doing" status="doing" searchQuery={searchQuery} />
                                <Column title="Done" status="done" searchQuery={searchQuery} />
                        </div>
                </div>
        );
}

export default App;
