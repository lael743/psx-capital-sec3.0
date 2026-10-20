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

/** Igualdade estrutural — a plataforma compara objetos de metadado por valor. */
function igual(a, b) {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => igual(a[k], b[k]));
}

export function casa(doc, cond) {
  if (!cond) return true;
  return Object.entries(cond).every(([campo, esperado]) => {
    if (campo === '$or') return esperado.some((c) => casa(doc, c));
    if (campo === '$and') return esperado.every((c) => casa(doc, c));
    const atual = getPath(doc, campo);
    const operatorio = esperado && typeof esperado === 'object' && !Array.isArray(esperado)
      && Object.keys(esperado).some((k) => k.startsWith('$'));
    if (operatorio) {
      return Object.entries(esperado).every(([op, val]) => {
        if (op === '$ne') return Array.isArray(atual) ? !atual.some((x) => igual(x, val)) : !igual(atual, val);
        if (op === '$exists') return val ? atual !== undefined : atual === undefined;
        if (op === '$lt') return atual !== undefined && atual !== null && atual < val;
        if (op === '$in') return Array.isArray(val) && val.includes(atual);
        return true;
      });
    }
    // Igualdade: em campo de lista vale "contém o elemento" (semântica do banco).
    return Array.isArray(atual) ? atual.some((x) => igual(x, esperado)) : igual(atual, esperado);
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
  if (update.$pull) {
    for (const [p, v] of Object.entries(update.$pull)) {
      const at = getPath(doc, p);
      if (!Array.isArray(at)) continue;
      // Critério em objeto remove todo elemento que casa por subconjunto
      // ($pull: { meta: { chave } } remove a entrada daquela chave).
      const criterio = v && typeof v === 'object' && !Array.isArray(v);
      setPath(doc, p, at.filter((x) => {
        if (criterio) {
          if (!x || typeof x !== 'object') return true;
          return !Object.entries(v).every(([k, val]) => igual(x[k], val));
        }
        return !igual(x, v);
      }));
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