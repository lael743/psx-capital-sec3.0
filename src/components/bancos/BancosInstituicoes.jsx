import { useState, useMemo } from 'react';
import { Search, Building2, ChevronDown, ChevronUp } from 'lucide-react';

// Lista completa de bancos brasileiros com códigos COMPE / BACEN
export const BANCOS_BRASILEIROS = [
  { code: '001', name: 'BANCO DO BRASIL S.A.' },
  { code: '003', name: 'BANCO DA AMAZONIA S.A.' },
  { code: '004', name: 'BANCO DO NORDESTE DO BRASIL S.A.' },
  { code: '007', name: 'BANCO NACIONAL DE DESENVOLVIMENTO ECONÔMICO E SOCIAL (BNDES)' },
  { code: '010', name: 'CREDICOAMO CRÉDITO RURAL COOPERATIVA' },
  { code: '011', name: 'C.SUISSE HEDGING-GRIFFO CORRETORA DE VALORES S.A' },
  { code: '012', name: 'BANCO INBURSA S.A.' },
  { code: '014', name: 'NATIXIS BRASIL S.A. BANCO MÚLTIPLO' },
  { code: '015', name: 'UBS BRASIL CORRETORA DE CÂMBIO, TÍTULOS E VALORES MOBILIÁRIOS S.A.' },
  { code: '016', name: 'CCM DESP TRÂNS SC E RS' },
  { code: '017', name: 'BNY MELLON BANCO S.A.' },
  { code: '018', name: 'BANCO TRICURY S.A.' },
  { code: '021', name: 'BANESTES S.A. BANCO DO ESTADO DO ESPIRITO SANTO' },
  { code: '024', name: 'BANCO BANDEPE S.A.' },
  { code: '025', name: 'BANCO ALFA S.A.' },
  { code: '029', name: 'BANCO ITAÚ CONSIGNADO S.A.' },
  { code: '033', name: 'BANCO SANTANDER (BRASIL) S.A.' },
  { code: '036', name: 'BANCO BRADESCO BBI S.A.' },
  { code: '037', name: 'BANCO DO ESTADO DO PARÁ S.A.' },
  { code: '040', name: 'BANCO CARGILL S.A.' },
  { code: '041', name: 'BANCO DO ESTADO DO RIO GRANDE DO SUL S.A. (BANRISUL)' },
  { code: '047', name: 'BANCO DO ESTADO DE SERGIPE S.A. (BANESE)' },
  { code: '060', name: 'CONFIDENCE CORRETORA DE CÂMBIO S.A.' },
  { code: '062', name: 'HIPERCARD BANCO MÚLTIPLO S.A.' },
  { code: '063', name: 'BANCO BRADESCARD S.A.' },
  { code: '064', name: 'GOLDMAN SACHS DO BRASIL BANCO MÚLTIPLO S.A.' },
  { code: '065', name: 'BANCO ANDBANK (BRASIL) S.A.' },
  { code: '066', name: 'BANCO MORGAN STANLEY S.A.' },
  { code: '069', name: 'BANCO CREFISA S.A.' },
  { code: '070', name: 'BANCO DE BRASÍLIA S.A. (BRB)' },
  { code: '074', name: 'BANCO J. SAFRA S.A.' },
  { code: '075', name: 'BANCO ABN AMRO S.A.' },
  { code: '076', name: 'BANCO KDB DO BRASIL S.A.' },
  { code: '077', name: 'BANCO INTER S.A.' },
  { code: '078', name: 'HAITONG BANCO DE INVESTIMENTO DO BRASIL S.A.' },
  { code: '079', name: 'BANCO ORIGINAL DO AGRONEGÓCIO S.A.' },
  { code: '080', name: 'B&T CORRETORA DE CAMBIO LTDA.' },
  { code: '081', name: 'BANCOSEGURO S.A.' },
  { code: '082', name: 'BANCO TOPÁZIO S.A.' },
  { code: '083', name: 'BANCO DA CHINA BRASIL S.A.' },
  { code: '084', name: 'UNIPRIME NORTE DO PARANÁ - COOP DE ECONOMIA E CRÉDITO MÚTUO DOS MÉDICOS' },
  { code: '085', name: 'COOPERATIVA CENTRAL DE CRÉDITO URBANO (CECRED)' },
  { code: '088', name: 'BANCO RANDON S.A.' },
  { code: '089', name: 'CREDISAN COOPERATIVA DE CRÉDITO' },
  { code: '091', name: 'CENTRAL DE COOPERATIVAS DE ECONOMIA E CRÉDITO MÚTUO DO ESTADO RS (UNICRED)' },
  { code: '092', name: 'BRK S.A. CRÉDITO, FINANCIAMENTO E INVESTIMENTO' },
  { code: '093', name: 'PÓLOCRED SCMEPP LTDA.' },
  { code: '094', name: 'BANCO FINAXIS S.A.' },
  { code: '095', name: 'TRAVELEX BANCO DE CÂMBIO S.A.' },
  { code: '096', name: 'BANCO B3 S.A.' },
  { code: '097', name: 'CREDISIS - CENTRAL DE COOPERATIVAS DE CRÉDITO DO ESTADO DE RONDÔNIA' },
  { code: '098', name: 'CREDIALIANÇA COOPERATIVA DE CRÉDITO RURAL' },
  { code: '099', name: 'UNIPRIME CENTRAL – CENTRAL INTERESTADUAL DE COOPERATIVAS DE CREDITO LTDA.' },
  { code: '100', name: 'PLANNER CORRETORA DE VALORES S.A.' },
  { code: '101', name: 'RENASCENÇA DISTRIBUIDORA DE TÍTULOS E VALORES MOBILIÁRIOS LTDA' },
  { code: '102', name: 'XP INVESTIMENTOS CORRETORA DE CÂMBIO, TÍTULOS E VALORES MOBILIÁRIOS S.A.' },
  { code: '104', name: 'CAIXA ECONÔMICA FEDERAL' },
  { code: '105', name: 'LECCA CRÉDITO, FINANCIAMENTO E INVESTIMENTO S/A' },
  { code: '107', name: 'BANCO BOCOM BBM S.A.' },
  { code: '108', name: 'PORTOCRED S.A. - CRÉDITO, FINANCIAMENTO E INVESTIMENTO' },
  { code: '111', name: 'OLIVEIRA TRUST DISTRIBUIDORA DE TÍTULOS E VALORES MOBILIÁRIOS S.A.' },
  { code: '113', name: 'MAGLIANO S.A. CORRETORA DE CAMBIO E VALORES MOBILIÁRIOS' },
  { code: '114', name: 'CENTRAL COOPERATIVA DE CRÉDITO NO ESTADO DO ESPÍRITO SANTO' },
  { code: '117', name: 'ADVANCED CORRETORA DE CÂMBIO LTDA' },
  { code: '119', name: 'BANCO WESTERN UNION DO BRASIL S.A.' },
  { code: '120', name: 'BANCO RODOBENS S.A.' },
  { code: '121', name: 'BANCO AGIBANK S.A.' },
  { code: '122', name: 'BANCO BRADESCO BERJ S.A.' },
  { code: '124', name: 'BANCO WOORI BANK DO BRASIL S.A.' },
  { code: '125', name: 'BRASIL PLURAL S.A. BANCO MÚLTIPLO' },
  { code: '126', name: 'BR PARTNERS BANCO DE INVESTIMENTO S.A.' },
  { code: '127', name: 'CODEPE CORRETORA DE VALORES E CÂMBIO S.A.' },
  { code: '128', name: 'MS BANK S.A. BANCO DE CÂMBIO' },
  { code: '129', name: 'UBS BRASIL BANCO DE INVESTIMENTO S.A.' },
  { code: '130', name: 'CARUANA S.A. - SOCIEDADE DE CRÉDITO, FINANCIAMENTO E INVESTIMENTO' },
  { code: '131', name: 'TULLETT PREBON BRASIL CORRETORA DE VALORES E CÂMBIO LTDA' },
  { code: '132', name: 'ICBC DO BRASIL BANCO MÚLTIPLO S.A.' },
  { code: '133', name: 'CRESOL - CONFEDERAÇÃO NACIONAL DAS COOPERATIVAS CENTRAIS DE CRÉDITO E ECONOMIA FAMILIAR' },
  { code: '134', name: 'BGC LIQUIDEZ DISTRIBUIDORA DE TÍTULOS E VALORES MOBILIÁRIOS LTDA' },
  { code: '136', name: 'CONFEDERAÇÃO NACIONAL DAS COOPERATIVAS CENTRAIS UNICRED LTDA (UNICRED DO BRASIL)' },
  { code: '138', name: 'GET MONEY CORRETORA DE CÂMBIO S.A.' },
  { code: '139', name: 'INTESA SANPAOLO BRASIL S.A. - BANCO MÚLTIPLO' },
  { code: '140', name: 'EASYNVEST - TÍTULO CORRETORA DE VALORES SA' },
  { code: '142', name: 'BROKER BRASIL CORRETORA DE CÂMBIO LTDA.' },
  { code: '143', name: 'TREVISO CORRETORA DE CÂMBIO S.A.' },
  { code: '144', name: 'BEXS BANCO DE CÂMBIO S/A' },
  { code: '145', name: 'LEVYCAM - CORRETORA DE CÂMBIO E VALORES LTDA.' },
  { code: '146', name: 'GUITTA CORRETORA DE CÂMBIO LTDA.' },
  { code: '149', name: 'FACTA FINANCEIRA S.A. - CRÉDITO FINANCIAMENTO E INVESTIMENTO' },
  { code: '157', name: 'ICAP DO BRASIL CORRETORA DE TÍTULOS E VALORES MOBILIÁRIOS LTDA.' },
  { code: '159', name: 'CASA DO CRÉDITO S.A. SOCIEDADE DE CRÉDITO AO MICROEMPREENDEDOR' },
  { code: '163', name: 'COMMERZBANK BRASIL S.A. - BANCO MÚLTIPLO' },
  { code: '169', name: 'BANCO OLÉ CONSIGNADO S.A.' },
  { code: '172', name: 'ALBATROSS CORRETORA DE CÂMBIO E VALORES S.A' },
  { code: '173', name: 'BRL TRUST DISTRIBUIDORA DE TÍTULOS E VALORES MOBILIÁRIOS S.A.' },
  { code: '174', name: 'PERNAMBUCANAS FINANCIADORA S.A.' },
  { code: '177', name: 'GUIDE INVESTIMENTOS S.A. CORRETORA DE VALORES' },
  { code: '180', name: 'CM CAPITAL MARKETS CORRETORA DE CÂMBIO, TÍTULOS E VALORES MOBILIÁRIOS LTDA' },
  { code: '182', name: 'DACASA FINANCEIRA S/A - SOCIEDADE DE CRÉDITO, FINANCIAMENTO E INVESTIMENTO' },
  { code: '183', name: 'SOCRED S.A. - SOCIEDADE DE CRÉDITO AO MICROEMPREENDEDOR E À EMPRESA DE PEQUENO PORTE' },
  { code: '184', name: 'BANCO ITAÚ BBA S.A.' },
  { code: '188', name: 'ATIVA INVESTIMENTOS S.A. CORRETORA DE TÍTULOS, CÂMBIO E VALORES' },
  { code: '189', name: 'HS FINANCEIRA S/A CRÉDITO, FINANCIAMENTO E INVESTIMENTOS' },
  { code: '190', name: 'SERVICOOP - COOPERATIVA DE CRÉDITO DOS SERVIDORES PÚBLICOS ESTADUAIS DO RIO' },
  { code: '191', name: 'NOVA FUTURA CORRETORA DE TÍTULOS E VALORES MOBILIÁRIOS LTDA.' },
  { code: '194', name: 'PARMETAL DISTRIBUIDORA DE TÍTULOS E VALORES MOBILIÁRIOS LTDA' },
  { code: '196', name: 'FAIR CORRETORA DE CÂMBIO S.A.' },
  { code: '197', name: 'STONE PAGAMENTOS S.A.' },
  { code: '208', name: 'BANCO BTG PACTUAL S.A.' },
  { code: '212', name: 'BANCO ORIGINAL S.A.' },
  { code: '213', name: 'BANCO ARBI S.A.' },
  { code: '217', name: 'BANCO JOHN DEERE S.A.' },
  { code: '218', name: 'BANCO BS2 S.A.' },
  { code: '222', name: 'BANCO CRÉDIT AGRICOLE BRASIL S.A.' },
  { code: '224', name: 'BANCO FIBRA S.A.' },
  { code: '233', name: 'BANCO CETELEM S.A.' },
  { code: '237', name: 'BANCO BRADESCO S.A.' },
  { code: '241', name: 'BANCO CLÁSSICO S.A.' },
  { code: '243', name: 'BANCO MÁXIMA S.A.' },
  { code: '246', name: 'BANCO ABC BRASIL S.A.' },
  { code: '249', name: 'BANCO INVESTCRED UNIBANCO S.A.' },
  { code: '250', name: 'BCV - BANCO DE CRÉDITO E VAREJO S.A.' },
  { code: '253', name: 'BEXS CORRETORA DE CÂMBIO S/A' },
  { code: '254', name: 'PARANÁ BANCO S.A.' },
  { code: '265', name: 'BANCO FATOR S.A.' },
  { code: '266', name: 'BANCO CÉDULA S.A.' },
  { code: '268', name: 'BARI COMPANHIA HIPOTECÁRIA' },
  { code: '269', name: 'BANCO HSBC S.A.' },
  { code: '270', name: 'SAGITUR CORRETORA DE CÂMBIO LTDA.' },
  { code: '271', name: 'IB CORRETORA DE CÂMBIO, TÍTULOS E VALORES MOBILIÁRIOS LTDA.' },
  { code: '272', name: 'AGK CORRETORA DE CÂMBIO S.A.' },
  { code: '273', name: 'COOPERATIVA DE CRÉDITO RURAL DE SÃO MIGUEL DO OESTE - SULCREDI/SÃO MIGUEL' },
  { code: '274', name: 'MONEY PLUS SOCIEDADE DE CRÉDITO AO MICROEMPREENDEDOR E A EMPRESA DE PEQUENO PORTE' },
  { code: '276', name: 'SENFF S.A. - CRÉDITO, FINANCIAMENTO E INVESTIMENTO' },
  { code: '278', name: 'GENIAL INVESTIMENTOS CORRETORA DE VALORES MOBILIÁRIOS S.A.' },
  { code: '279', name: 'COOPERATIVA DE CREDITO RURAL DE PRIMAVERA DO LESTE' },
  { code: '280', name: 'AVISTA S.A. CRÉDITO, FINANCIAMENTO E INVESTIMENTO' },
  { code: '281', name: 'COOPERATIVA DE CRÉDITO RURAL COOPAVEL' },
  { code: '283', name: 'RB INVESTIMENTOS DISTRIBUIDORA DE TÍTULOS E VALORES MOBILIÁRIOS LTDA.' },
  { code: '285', name: 'FRENTE CORRETORA DE CÂMBIO LTDA.' },
  { code: '286', name: 'COOPERATIVA DE CRÉDITO RURAL DE OURO SULCREDI/OURO' },
  { code: '288', name: 'CAROL DISTRIBUIDORA DE TÍTULOS E VALORES MOBILIÁRIOS LTDA.' },
  { code: '289', name: 'DECYSEO CORRETORA DE CÂMBIO LTDA.' },
  { code: '290', name: 'PAGSEGURO INTERNET S.A.' },
  { code: '292', name: 'BS2 DISTRIBUIDORA DE TÍTULOS E VALORES MOBILIÁRIOS S.A.' },
  { code: '293', name: 'LASTRO RDV DISTRIBUIDORA DE TÍTULOS E VALORES MOBILIÁRIOS LTDA.' },
  { code: '296', name: 'OZ CORRETORA DE CÂMBIO S.A.' },
  { code: '298', name: 'VIPS CC LTDA.' },
  { code: '299', name: 'SOROCRED CRÉDITO, FINANCIAMENTO E INVESTIMENTO S/A.' },
  { code: '300', name: 'BANCO DE LA NACION ARGENTINA' },
  { code: '301', name: 'BPP INSTITUIÇÃO DE PAGAMENTO S.A.' },
  { code: '306', name: 'PORTOPAR DISTRIBUIDORA DE TÍTULOS E VALORES MOBILIÁRIOS LTDA.' },
  { code: '307', name: 'TERRA INVESTIMENTOS DISTRIBUIDORA DE TÍTULOS E VALORES MOBILIÁRIOS LTDA.' },
  { code: '309', name: 'CAMBIONET CORRETORA DE CÂMBIO LTDA.' },
  { code: '310', name: 'VORTX DISTRIBUIDORA DE TÍTULOS E VALORES MOBILIÁRIOS LTDA.' },
  { code: '313', name: 'AMAZÔNIA CORRETORA DE CÂMBIO LTDA.' },
  { code: '315', name: 'PI DISTRIBUIDORA DE TÍTULOS E VALORES MOBILIÁRIOS S.A.' },
  { code: '318', name: 'BANCO BMG S.A.' },
  { code: '319', name: 'OM DISTRIBUIDORA DE TÍTULOS E VALORES MOBILIÁRIOS LTDA' },
  { code: '320', name: 'CHINA UNION PAY BRASIL INSTITUIÇÃO DE PAGAMENTO LTDA.' },
  { code: '321', name: 'CREFAZ SOCIEDADE DE CRÉDITO AO MICROEMPREENDEDOR E À EMPRESA DE PEQUENO PORTE LTDA.' },
  { code: '322', name: 'COOPERATIVA DE CRÉDITO RURAL DE ABELARDO LUZ - SULCREDI/CREDILUZ' },
  { code: '323', name: 'MERCADO PAGO INSTITUIÇÃO DE PAGAMENTO LTDA.' },
  { code: '324', name: 'CARTOS SOCIEDADE DE CRÉDITO DIRETO S.A.' },
  { code: '325', name: 'ÓRAMA DISTRIBUIDORA DE TÍTULOS E VALORES MOBILIÁRIOS S.A.' },
  { code: '326', name: 'PARATI - CRÉDITO, FINANCIAMENTO E INVESTIMENTO S.A.' },
  { code: '328', name: 'CHAMBRE DISTRIBUIDORA DE TÍTULOS E VALORES MOBILIÁRIOS LTDA.' },
  { code: '329', name: 'QI SOCIEDADE DE CRÉDITO DIRETO S.A.' },
  { code: '330', name: 'BANCO BARI DE INVESTIMENTOS E FINANCIAMENTOS S.A.' },
  { code: '331', name: 'FRAM CAPITAL DISTRIBUIDORA DE TÍTULOS E VALORES MOBILIÁRIOS S.A.' },
  { code: '332', name: 'ACESSO SOLUÇÕES DE PAGAMENTO S.A.' },
  { code: '335', name: 'BANCO DIGIO S.A.' },
  { code: '336', name: 'BANCO C6 S.A.' },
  { code: '340', name: 'SUPER PAGAMENTOS E ADMINISTRAÇÃO DE MEIOS ELETRÔNICOS LTDA.' },
  { code: '341', name: 'BANCO ITAÚ S.A.' },
  { code: '342', name: 'CREDITAS SOCIEDADE DE CRÉDITO DIRETO S.A.' },
  { code: '343', name: 'FFA SOCIEDADE DE CRÉDITO AO MICROEMPREENDEDOR E À EMPRESA DE PEQUENO PORTE LTDA.' },
  { code: '348', name: 'BANCO XP S.A.' },
  { code: '349', name: 'AL5 S.A. CRÉDITO, FINANCIAMENTO E INVESTIMENTO' },
  { code: '350', name: 'COOPERATIVA DE CRÉDITO RURAL DE PEQUENOS AGRICULTORES E DA REFORMA AGRÁRIA DO CENTRO OESTE' },
  { code: '352', name: 'TORO CORRETORA DE TÍTULOS E VALORES MOBILIÁRIOS LTDA' },
  { code: '354', name: 'NECTON INVESTIMENTOS S.A. CORRETORA DE VALORES MOBILIÁRIOS E COMMODITIES' },
  { code: '355', name: 'ÓTIMO SOCIEDADE DE CRÉDITO DIRETO S.A.' },
  { code: '358', name: 'MIDWAY S.A. CRÉDITO, FINANCIAMENTO E INVESTIMENTO' },
  { code: '359', name: 'ZEMA CRÉDITO, FINANCIAMENTO E INVESTIMENTO S/A' },
  { code: '360', name: 'TRINUS CAPITAL DISTRIBUIDORA DE TÍTULOS E VALORES MOBILIÁRIOS S.A.' },
  { code: '362', name: 'CIELO S.A.' },
  { code: '363', name: 'SINGULARE CORRETORA DE TÍTULOS E VALORES MOBILIÁRIOS S.A.' },
  { code: '364', name: 'GERENCIANET S.A.' },
  { code: '365', name: 'SIMPAUL CORRETORA DE CAMBIO E VALORES MOBILIÁRIOS S.A.' },
  { code: '366', name: 'BANCO SOCIÉTÉ GÉNÉRALE BRASIL S.A.' },
  { code: '368', name: 'BANCO CSF S.A.' },
  { code: '370', name: 'BANCO MIZUHO DO BRASIL S.A.' },
  { code: '376', name: 'BANCO J.P. MORGAN S.A.' },
  { code: '378', name: 'BBC LEASING S.A. - ARRENDAMENTO MERCANTIL' },
  { code: '380', name: 'PICPAY INSTITUIÇÃO DE PAGAMENTO S.A.' },
  { code: '381', name: 'BANCO MERCEDES-BENZ DO BRASIL S.A.' },
  { code: '382', name: 'FIDÚCIA SOCIEDADE DE CRÉDITO AO MICROEMPREENDEDOR E À EMPRESA DE PEQUENO PORTE LTDA.' },
  { code: '383', name: 'EBANX INSTITUIÇÃO DE PAGAMENTOS LTDA.' },
  { code: '387', name: 'BANCO TOYOTA DO BRASIL S.A.' },
  { code: '389', name: 'BANCO MERCANTIL DO BRASIL S.A.' },
  { code: '390', name: 'BANCO GM S.A.' },
  { code: '393', name: 'BANCO VOLKSWAGEN S.A.' },
  { code: '394', name: 'BANCO BRADESCO FINANCIAMENTOS S.A.' },
  { code: '396', name: 'HUB INSTITUIÇÃO DE PAGAMENTO S.A.' },
  { code: '399', name: 'KIRTON BANK S.A. - BANCO MÚLTIPLO' },
  { code: '403', name: 'CORA SOCIEDADE DE CRÉDITO DIRETO S.A.' },
  { code: '404', name: 'SUMUP SOCIEDADE DE CRÉDITO DIRETO S.A.' },
  { code: '408', name: 'BÔNUSCRED SOCIEDADE DE CRÉDITO DIRETO S.A.' },
  { code: '412', name: 'BANCO CAPITAL S.A.' },
  { code: '422', name: 'BANCO SAFRA S.A.' },
  { code: '456', name: 'BANCO MUFG BRASIL S.A.' },
  { code: '464', name: 'BANCO SUMITOMO MITSUI BRASILEIRO S.A.' },
  { code: '473', name: 'BANCO CAIXA GERAL - BRASIL S.A.' },
  { code: '479', name: 'BANCO ITAUBANK S.A.' },
  { code: '495', name: 'BANCO DE LA PROVINCIA DE BUENOS AIRES' },
  { code: '505', name: 'BANCO CREDIT SUISSE (BRASIL) S.A.' },
  { code: '545', name: 'SENSO CORRETORA DE CÂMBIO E VALORES MOBILIÁRIOS S.A' },
  { code: '600', name: 'BANCO LUSO BRASILEIRO S.A.' },
  { code: '604', name: 'BANCO INDUSTRIAL DO BRASIL S.A.' },
  { code: '610', name: 'BANCO VR S.A.' },
  { code: '611', name: 'BANCO PAULISTA S.A.' },
  { code: '612', name: 'BANCO GUANABARA S.A.' },
  { code: '623', name: 'BANCO PAN S.A.' },
  { code: '626', name: 'BANCO C6 CONSIGNADO S.A.' },
  { code: '630', name: 'BANCO SMARTBANK S.A.' },
  { code: '633', name: 'BANCO RENDIMENTO S.A.' },
  { code: '634', name: 'BANCO TRIÂNGULO S.A.' },
  { code: '637', name: 'BANCO SOFISA S.A.' },
  { code: '643', name: 'BANCO PINE S.A.' },
  { code: '652', name: 'ITAÚ UNIBANCO HOLDING S.A.' },
  { code: '653', name: 'BANCO INDUSVAL S.A.' },
  { code: '654', name: 'BANCO DIGIMAIS S.A.' },
  { code: '655', name: 'BANCO VOTORANTIM S.A.' },
  { code: '707', name: 'BANCO DAYCOVAL S.A.' },
  { code: '712', name: 'BANCO OURINVEST S.A.' },
  { code: '739', name: 'BANCO CETELEM S.A.' },
  { code: '741', name: 'BANCO RIBEIRÃO PRETO S.A.' },
  { code: '743', name: 'BANCO SEMEAR S.A.' },
  { code: '745', name: 'BANCO CITIBANK S.A.' },
  { code: '746', name: 'BANCO MODAL S.A.' },
  { code: '747', name: 'BANCO RABOBANK INTERNATIONAL BRASIL S.A.' },
  { code: '748', name: 'BANCO COOPERATIVO SICREDI S.A.' },
  { code: '752', name: 'BANCO BNP PARIBAS BRASIL S.A.' },
  { code: '754', name: 'BANCO SISTEMA S.A.' },
  { code: '755', name: 'BANK OF AMERICA MERRILL LYNCH BANCO MÚLTIPLO S.A.' },
  { code: '756', name: 'BANCO COOPERATIVO DO BRASIL S.A. - SICOOB' },
  { code: '757', name: 'BANCO KEB HANA DO BRASIL S.A.' },
];

export default function BancosInstituicoes() {
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState('code');
  const [sortDir, setSortDir] = useState('asc');

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    let list = q
      ? BANCOS_BRASILEIROS.filter(b => b.code.includes(q) || b.name.toLowerCase().includes(q))
      : [...BANCOS_BRASILEIROS];

    list.sort((a, b) => {
      const va = sortField === 'code' ? a.code : a.name;
      const vb = sortField === 'code' ? b.code : b.name;
      return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
    });
    return list;
  }, [search, sortField, sortDir]);

  const toggleSort = (field) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  };

  const SortIcon = ({ field }) => {
    if (sortField !== field) return <ChevronDown className="w-3 h-3 text-gray-300 inline ml-1" />;
    return sortDir === 'asc'
      ? <ChevronUp className="w-3 h-3 inline ml-1" />
      : <ChevronDown className="w-3 h-3 inline ml-1" />;
  };

  return (
    <div className="space-y-4">
      {/* Header e busca */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div>
          <h2 className="text-sm font-bold">Tabela de Instituições Financeiras</h2>
          <p className="text-xs text-muted-foreground">{BANCOS_BRASILEIROS.length} instituições cadastradas pelo BACEN</p>
        </div>
        <div className="relative sm:ml-auto w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            className="input-field pl-9 text-sm"
            placeholder="Buscar por código ou nome..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Tabela */}
      <div className="border border-border rounded-xl overflow-hidden">
        <div className="overflow-y-auto max-h-[540px]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="bg-gray-50 border-b border-border">
                <th
                  onClick={() => toggleSort('code')}
                  className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors w-28"
                >
                  Código <SortIcon field="code" />
                </th>
                <th
                  onClick={() => toggleSort('name')}
                  className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors"
                >
                  Nome da Instituição <SortIcon field="name" />
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map(b => (
                <tr key={b.code} className="hover:bg-gray-50/60 transition-colors">
                  <td className="px-4 py-2.5">
                    <span className="inline-flex items-center px-2 py-0.5 bg-foreground text-primary-foreground text-xs font-mono font-bold rounded">
                      {b.code}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-xs font-medium text-foreground">{b.name}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={2} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    Nenhuma instituição encontrada para "{search}"
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2.5 bg-gray-50 border-t border-border text-xs text-muted-foreground">
          {filtered.length} de {BANCOS_BRASILEIROS.length} instituições
        </div>
      </div>
    </div>
  );
}