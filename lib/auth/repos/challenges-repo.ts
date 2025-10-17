import type { Storage } from "unstorage";
import type { Challenge, ChallengeKey } from "./types.ts";

const createKey = (id: string): ChallengeKey => `challenge:${id}`;

export function createChallengeRepo(storage: Storage) {
	return {
		get: (id: string) => storage.get<Challenge>(createKey(id)),
		set: (key: string, value: Challenge) =>
			storage.set<Challenge>(createKey(key), value),
	};
}
