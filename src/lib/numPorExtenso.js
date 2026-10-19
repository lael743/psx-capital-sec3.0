/**
 * Converte número para extenso em português brasileiro.
 * Suporta valores de centavos até bilhões.
 */

const unidades = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove',
  'dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];

const dezenas = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];

const centenas = ['', 'cem', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos',
  'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];

function grupo(n) {
  // converte 0..999 para extenso
  if (n === 0) return '';
  if (n === 100) return 'cem';
  let result = '';
  const c = Math.floor(n / 100);
  const resto = n % 100;
  if (c > 0) result += centenas[c];
  if (c > 0 && resto > 0) result += ' e ';
  if (resto > 0) {
    if (resto < 20) {
      result += unidades[resto];
    } else {
      const d = Math.floor(resto / 10);
      const u = resto % 10;
      result += dezenas[d];
      if (u > 0) result += ' e ' + unidades[u];
    }
  }
  return result;
}

/**
 * Converte número inteiro para extenso SEM unidade monetária.
 * Ex: 3 → "três", 30 → "trinta"
 */
export function numExtenso(valor) {
  if (isNaN(valor) || valor === null || valor === undefined) return '';
  valor = Math.floor(Math.abs(Number(valor)));
  if (valor === 0) return 'zero';
  const bilhoes = Math.floor(valor / 1_000_000_000);
  const milhoes = Math.floor((valor % 1_000_000_000) / 1_000_000);
  const milhares = Math.floor((valor % 1_000_000) / 1000);
  const resto = valor % 1000;
  const partes = [];
  if (bilhoes > 0) partes.push(grupo(bilhoes) + (bilhoes === 1 ? ' bilhão' : ' bilhões'));
  if (milhoes > 0) partes.push(grupo(milhoes) + (milhoes === 1 ? ' milhão' : ' milhões'));
  if (milhares > 0) partes.push(grupo(milhares) + (milhares === 1 ? ' mil' : ' mil'));
  if (resto > 0) partes.push(grupo(resto));
  return partes.join(' e ');
}

export function numPorExtenso(valor) {
  if (isNaN(valor) || valor === null || valor === undefined) return '';
  valor = Math.abs(Number(valor));

  const inteiro = Math.floor(valor);
  const centavos = Math.round((valor - inteiro) * 100);

  if (inteiro === 0 && centavos === 0) return 'zero reais';

  let partes = [];

  const bilhoes = Math.floor(inteiro / 1_000_000_000);
  const milhoes = Math.floor((inteiro % 1_000_000_000) / 1_000_000);
  const milhares = Math.floor((inteiro % 1_000_000) / 1000);
  const reais = inteiro % 1000;

  if (bilhoes > 0) {
    partes.push(grupo(bilhoes) + (bilhoes === 1 ? ' bilhão' : ' bilhões'));
  }
  if (milhoes > 0) {
    partes.push(grupo(milhoes) + (milhoes === 1 ? ' milhão' : ' milhões'));
  }
  if (milhares > 0) {
    partes.push(grupo(milhares) + (milhares === 1 ? ' mil' : ' mil'));
  }
  if (reais > 0) {
    partes.push(grupo(reais));
  }

  let textoInteiro = partes.join(' e ');
  if (!textoInteiro) textoInteiro = 'zero';

  const labelReais = inteiro === 1 ? 'real' : 'reais';

  if (centavos === 0) {
    return `${textoInteiro} ${labelReais}`;
  }

  const textoCentavos = grupo(centavos);
  const labelCentavos = centavos === 1 ? 'centavo' : 'centavos';

  if (inteiro === 0) {
    return `${textoCentavos} ${labelCentavos}`;
  }

  return `${textoInteiro} ${labelReais} e ${textoCentavos} ${labelCentavos}`;
}

const MESES_NOMES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'
];

/**
 * Converte data ISO (YYYY-MM-DD) para extenso: "vinte e quatro de outubro de dois mil e vinte e seis"
 */
export function dataPorExtenso(isoDate) {
  if (!isoDate) return '';
  const [y, m, d] = isoDate.split('-').map(Number);
  if (isNaN(y) || isNaN(m) || isNaN(d)) return '';

  const diaExtenso = numExtenso(d);
  const mesExtenso = MESES_NOMES[m - 1];
  const anoExtenso = numExtenso(y);

  return `${diaExtenso} de ${mesExtenso} de ${anoExtenso}`;
}