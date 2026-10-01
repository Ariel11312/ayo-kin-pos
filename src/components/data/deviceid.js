// A browser cannot read a phone's IMEI/hardware ID. The practical equivalent
// is a random ID generated once and kept on that phone. The server binds the
// employee to the first ID it sees and rejects any other.

const KEY = "timeclock.deviceId";
const CODE_KEY = "timeclock.employeeCode";

export function getDeviceId() {
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(KEY, id);
  }
  return id;
}
export const getSavedEmployeeCode = () => localStorage.getItem(CODE_KEY) || "";
export const saveEmployeeCode = (c) => localStorage.setItem(CODE_KEY, c);
export const forgetEmployeeCode = () => localStorage.removeItem(CODE_KEY);