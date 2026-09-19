// VietQR / EMVCo QR builder (chuẩn Napas VietQR, dạng chuyển khoản nhanh 970xxx)
export const BANKS: [string, string][] = [
  ["970432", "VPBank"],
  ["970436", "Vietcombank"],
  ["970415", "VietinBank"],
  ["970418", "BIDV"],
  ["970405", "Agribank"],
  ["970407", "Techcombank"],
  ["970422", "MB Bank"],
  ["970416", "ACB"],
  ["970403", "Sacombank"],
  ["970423", "TPBank"],
  ["970441", "VIB"],
  ["970443", "SHB"],
  ["970437", "HDBank"],
  ["970448", "OCB"],
  ["970426", "MSB"],
  ["970429", "SCB"],
  ["970440", "SeABank"],
  ["970431", "Eximbank"],
  ["970449", "LPBank"],
  ["970454", "BVBank"],
];

function crc16(str: string): string {
  let crc = 0xffff;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

function tlv(id: string, val: string): string {
  return id + String(val.length).padStart(2, "0") + val;
}

export function buildVietQR(opts: {
  bin: string;
  account: string;
  name: string;
  amount?: string | null;
  note?: string | null;
}): string {
  const { bin, account, name, amount, note } = opts;
  const sub38 =
    tlv("00", "A000000727") +
    tlv("01", tlv("00", bin) + tlv("01", account)) +
    tlv("02", "QRIBFTTA");
  let payload =
    tlv("00", "01") + tlv("01", amount ? "12" : "11") + tlv("38", sub38) + tlv("53", "704");
  if (amount) payload += tlv("54", String(amount));
  payload += tlv("58", "VN") + tlv("59", (name || "").toUpperCase().slice(0, 25));
  payload += tlv("60", "Ha Noi");
  if (note) payload += tlv("62", tlv("08", note.slice(0, 25)));
  payload += "6304";
  return payload + crc16(payload);
}

export const COST_PER_CREDIT = 250;

export const TEMPLATES = [
  { id: 0, name: "Neon Grid", className: "tpl-1" },
  { id: 1, name: "Glass Purple", className: "tpl-2" },
  { id: 2, name: "Minimal Dark", className: "tpl-3" },
];
