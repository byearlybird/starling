const map = new Map([
	["key1", "value1"],
	["key2", "value2"],
]);

const serialized = JSON.stringify(Array.from(map.entries()));
const deserialized = new Map(JSON.parse(serialized));

console.log(serialized);
console.log(deserialized);
