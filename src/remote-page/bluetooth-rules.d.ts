export const BLUETOOTH_ADDRESS:RegExp;
export const BLUETOOTH_OPS:string[];
export const BLUETOOTH_SCAN_MS:number;
export function bluetoothExpression(op:string,address?:string,waitMs?:number):string;
export function bluetoothListing(devices:any[]):{address:string;name:string;kind:string;paired:boolean;connected:boolean;pairing:boolean}[];
export function bluetoothMessage(error:unknown):string;
