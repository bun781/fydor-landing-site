"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { TRANSITIONS, assertRoleForAction, assertTransition, canTransition } = require("../lib/state-machine");

test("accepts every centralized transition",()=>{for(const [from,targets] of Object.entries(TRANSITIONS))for(const to of targets){assert.equal(canTransition(from,to),true);assert.doesNotThrow(()=>assertTransition(from,to));}});
test("rejects invalid transitions",()=>{for(const [from,to] of [["draft","published"],["submitted","published"],["rejected","reviewing"],["published","rejected"]])assert.throws(()=>assertTransition(from,to));});
test("enforces role restrictions",()=>{assert.doesNotThrow(()=>assertRoleForAction(["moderator"],"language_approve"));assert.throws(()=>assertRoleForAction(["moderator"],"publish"));assert.throws(()=>assertRoleForAction(["contributor"],"reject"));});
