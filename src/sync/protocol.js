const SYNC_META_KEYS = new Set(['rev', 'baseRev', 'updatedAt', 'deviceId', 'syncStatus', 'id', 'createdAt']);
/** Champs modifiés entre deux états (référence commune base). */
export function diffFields(base, current) {
    const keys = base ? new Set([...Object.keys(current), ...Object.keys(base)]) : new Set(Object.keys(current));
    const fields = [];
    for (const key of keys) {
        if (SYNC_META_KEYS.has(key))
            continue;
        if (JSON.stringify(current[key]) !== JSON.stringify(base?.[key]))
            fields.push(key);
    }
    return fields;
}
/**
 * Décide de fusionner ou signaler un conflit.
 * Seuls les champs modifiés par le client sont appliqués — les autres
 * modifications du serveur sont préservées (pas d'écrasement accidentel).
 * Un champ modifié des deux côtés avec des valeurs différentes = conflit.
 */
export function decideMerge(changedFields, baseSnapshot, serverCurrent, clientPayload) {
    const merged = { ...serverCurrent };
    const conflicts = [];
    for (const field of changedFields) {
        const baseValue = baseSnapshot[field];
        const remoteValue = serverCurrent[field];
        const localValue = clientPayload[field];
        const serverChanged = JSON.stringify(remoteValue ?? null) !== JSON.stringify(baseValue ?? null);
        if (!serverChanged) {
            merged[field] = localValue;
            continue;
        }
        const same = JSON.stringify(localValue ?? null) === JSON.stringify(remoteValue ?? null);
        if (!same) {
            conflicts.push({ field, remoteValue, baseValue });
        }
        // valeurs identiques : rien à faire, la valeur courante est déjà la bonne.
    }
    return conflicts.length === 0 ? { merge: merged, conflicts: [] } : { merge: null, conflicts };
}
