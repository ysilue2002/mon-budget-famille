/** Identifiants UUID et générateur d'appareil. */
export function uuid() {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
        return crypto.randomUUID();
    }
    // Repli (contextes sans crypto.randomUUID)
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}
const DEVICE_KEY = 'mbf.deviceId';
/** Identifiant stable de l'appareil (stocké localement). */
export function getDeviceId() {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
        id = uuid();
        localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
}
