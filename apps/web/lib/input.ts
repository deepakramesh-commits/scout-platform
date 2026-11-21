// Relative `.ts` imports only: node --test loads this.
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const str = (form: FormData, k: string) => String(form.get(k) ?? "").trim();
