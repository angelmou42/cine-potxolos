// Encrypts the daily copies with the member code. Same day + same data gives the same file, so unchanged days make no new commit.
import { scryptSync, createCipheriv, createDecipheriv, createHmac } from "node:crypto";
import { KEY } from "./common.mjs";

const key = scryptSync(KEY, "cine-potxolos-copias", 32);
export function seal(text, day) {
  const iv = createHmac("sha256", key).update(day + "\n" + text).digest().subarray(0, 12); // deterministic, unique per content
  const c = createCipheriv("aes-256-gcm", key, iv), data = Buffer.concat([c.update(text, "utf8"), c.final()]);
  return { v: 1, cifrado: "aes-256-gcm, clave = código de socio", iv: iv.toString("base64"), tag: c.getAuthTag().toString("base64"), data: data.toString("base64") };
}
export function open(box) {
  const d = createDecipheriv("aes-256-gcm", key, Buffer.from(box.iv, "base64"));
  d.setAuthTag(Buffer.from(box.tag, "base64"));
  try { return Buffer.concat([d.update(Buffer.from(box.data, "base64")), d.final()]).toString("utf8"); }
  catch (e) { throw new Error("No se puede abrir la copia: el código de socio no es el mismo con el que se guardó."); }
}
