/**
 * Simulador mínimo da plataforma para os testes de integridade.
 *
 * Implementa o subconjunto realmente usado pela regra: `$ne` (escalar e
 * array), `$exists`, `$lt`, `$in`, `$or`, `$and`, `$inc`, `$push` e `$set`
 * pontilhado.
 *
 * IMPORTANTE: `updateWhere` CEDE o controle antes de mutar. É essa janela que
 * permite duas chamadas simultâneas se intercalarem de verdade — sem ela, um
 * teste de concorrência passaria sem provar nada.
 */

const tick = () => new Promise((r) => setTimeout(r, 0));

const getPath = (o, p) => p.split('.').reduce((a, k) => (a == null ? undefined : a[k]), o);

function setPath(o, p, v) {
  const parts = p.split('.');
  let cur = o;
  for (let i = 0; i < parts.length - 1; i += 1) {
    if (typeof cur[parts[i]] !== 'object' || cur[parts[i]] === null) cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = v;
}

export function casa(doc, cond) {
  if (!cond) return true;
  return Object.entries(cond).every(([campo, esperado]) => {
    if (campo === '$or') return esperado.some((c) => casa(doc, c));
    if (campo === '$and') return esperado.every((c) => casa(doc, c));
    const atual = getPath(doc, campo);
    if (esperado && typeof esperado === 'object' && !Array.isArray(esperado)) {
      return Object.entries(esperado).every(([op, val]) => {
        if (op === '$ne') return Array.isArray(atual) ? !atual.includes(val) : atual !== val;
        if (op === '$exists') return val ? atual !== undefined : atual === undefined;
        if (op === '$lt') return atual !== undefined && atual !== null && atual < val;
        if (op === '$in') return Array.isArray(val) && val.includes(atual);
        return true;
      });
    }
    return atual === esperado;
  });
}

export function aplicar(doc, update) {
  if (update.$set) for (const [p, v] of Object.entries(update.$set)) setPath(doc, p, v);
  if (update.$inc) for (const [p, v] of Object.entries(update.$inc)) setPath(doc, p, (Number(getPath(doc, p)) || 0) + v);
  if (update.$push) {
    for (const [p, v] of Object.entries(update.$push)) {
      const at = getPath(doc, p);
      setPath(doc, p, Array.isArray(at) ? [...at, v] : [v]);
    }
  }
}

export function criarColecao(nome) {
  return {
    docs: [],
    seq: 0,
    async filter(q) {
      await tick();
      return this.docs.filter((d) => casa(d, q)).map((d) => ({ ...d }));
    },
    async create(d) {
      await tick();
      this.seq += 1;
      const doc = { id: `${nome}-${this.seq}`, ...d };
      this.docs.push(doc);
      return { ...doc };
    },
    async updateWhere(q, u) {
      await tick();
      const alvos = this.docs.filter((d) => casa(d, q));
      alvos.forEach((d) => aplicar(d, u));
      return { updated: alvos.length };
    },
    achar(id) {
      return this.docs.find((d) => d.id === id);
    },
  };
}