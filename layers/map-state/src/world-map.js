// map-state - derive the run's map from an authored Adventure.
//
// Nothing here is authored twice: the nodes ARE the adventure's instances, the doors ARE the portals
// that carry a `link`, the exits ARE the portals whose far side is "EXIT", and the entry IS
// `progression.start`. A city is therefore just an Adventure whose instances happen to be a street
// and the buildings on it; no separate map document can drift out of sync with the geometry.

import { MapInvalidError } from "./errors.js";

const LINK = "LINK";
const EXIT = "EXIT";

function labelOf(instance) {
  const label = instance.rules?.label;
  return typeof label === "string" && label ? label : instance.id;
}

// What this instance is on the map. City levels stamp `rules.mapKind` (street / floor / house);
// anything that does not is a plain instance, which is what every pre-city adventure is.
function kindOf(instance) {
  const kind = instance.rules?.mapKind;
  return typeof kind === "string" && kind ? kind : "instance";
}

function isExitPortal(portal) {
  return portal.roomA === EXIT || portal.roomB === EXIT;
}

export function buildWorldMap(adventure) {
  const instances = adventure?.instances;
  if (!Array.isArray(instances) || instances.length === 0) {
    throw new MapInvalidError("no instances");
  }

  const nodes = instances.map((instance) => ({
    instanceId: instance.id,
    label: labelOf(instance),
    kind: kindOf(instance),
  }));
  const ids = new Set(nodes.map((n) => n.instanceId));

  const entry = adventure.progression?.start ?? instances[0].id;
  if (!ids.has(entry)) {
    throw new MapInvalidError(`entry names a missing instance: ${entry}`);
  }

  const doors = [];
  const exits = [];
  const seenPortals = new Set();
  for (const instance of instances) {
    for (const portal of instance.portals ?? []) {
      const isDoor = portal.roomB === LINK;
      const isExit = isExitPortal(portal);
      if (!isDoor && !isExit) continue;
      // Doors and exits are addressed map-wide by portal id, so a reused id would open the wrong
      // door from the wrong instance. Catch it here rather than letting play go strange.
      if (seenPortals.has(portal.id)) {
        throw new MapInvalidError(`portal id used twice across instances: ${portal.id}`);
      }
      seenPortals.add(portal.id);

      if (isDoor) {
        const to = portal.link?.instanceId;
        if (!ids.has(to)) {
          throw new MapInvalidError(`door ${portal.id} links to a missing instance: ${to}`);
        }
        doors.push({
          portalId: portal.id,
          from: instance.id,
          to,
          kind: portal.link.kind,
          lock: portal.lock ?? null,
        });
      } else {
        exits.push({ portalId: portal.id, instanceId: instance.id, lock: portal.lock ?? null });
      }
    }
  }

  // An `all_cleared` gate never counts the instance it stands in: requiring a level to be cleared
  // before you may leave it is a deadlock, and the gate is what "cleared" would mean there anyway.
  const gateHolders = new Set(
    [...doors, ...exits]
      .filter((p) => p.lock?.rule === "all_cleared")
      .map((p) => p.instanceId ?? p.from)
  );
  const required = nodes.map((n) => n.instanceId).filter((id) => !gateHolders.has(id));

  return { entry, nodes, doors, exits, required };
}
