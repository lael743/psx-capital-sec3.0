import { QRCodeSVG } from 'qrcode.react';
import { formatCurrency } from '@/lib/finance';
import { numPorExtenso as defaultNumPorExtenso, numExtenso } from '@/lib/numPorExtenso';

const STORAGE_KEY = 'psx_company_settings';
function getSettings() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; }
}

export default function CessaoCreditoPreview({ dados, fmtDate, numPorExtenso: numPorExtensoProps }) {
  const numPorExtenso = numPorExtensoProps || defaultNumPorExtenso;
  const s = getSettings();
  const {
    cedente_nome, cedente_doc, cedente_rg, cedente_endereco, cedente_cidade, cedente_estado,
    cedido_nome, cedido_doc, cedido_rg, cedido_endereco, cedido_cidade, cedido_estado,
    valor_nominal, valor_liquido, desagio_valor, taxa_pct,
    data_liberacao, data_vencimento,
    num_promissoria, num_operacao,
    multa_pct, mora_pct, prazo_atraso,
    dias_recompra, honorario_cobranca,
    foro_cidade,
    test1_nome, test1_cpf, test2_nome, test2_cpf,
    operacao,
    validacao_url,
    document_hash,
  } = dados;

  const diasRecompra = dias_recompra || '30';
  const honorarioCobranca = honorario_cobranca || '10';

  const qrUrl = validacao_url || `${window.location.origin}/validar`;
  const schedule = operacao?.installment_schedule || [];

  const hoje = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
  const praça = foro_cidade || s.company_city || 'CUIABÁ';

  const companyName = s.company_name || 'PSX CAPITAL';
  const companyDoc = s.company_document || '';
  const companyAddress = [s.company_address, s.company_city, s.company_state].filter(Boolean).join(', ');

  const P = ({ children, className = '' }) => (
    <p className={`text-sm leading-relaxed text-gray-800 mb-3 text-justify ${className}`}>{children}</p>
  );
  const Clausula = ({ num, titulo, children }) => (
    <div className="mb-5">
      <p className="text-sm font-bold text-gray-900 mb-2 uppercase tracking-wide">CLÁUSULA {num} — {titulo}</p>
      {children}
    </div>
  );
  const Bold = ({ children }) => <strong className="font-bold">{children}</strong>;

  let clausulaNum = 0;
  const nextClausula = (titulo) => {
    clausulaNum++;
    const romans = ['PRIMEIRA','SEGUNDA','TERCEIRA','QUARTA','QUINTA','SEXTA','SÉTIMA','OITAVA','NONA','DÉCIMA','DÉCIMA PRIMEIRA','DÉCIMA SEGUNDA','DÉCIMA TERCEIRA','DÉCIMA QUARTA','DÉCIMA QUINTA','DÉCIMA SEXTA','DÉCIMA SÉTIMA','DÉCIMA OITAVA','DÉCIMA NONA','VIGÉSIMA'];
    return romans[clausulaNum - 1] || `${clausulaNum}ª`;
  };

  return (
    <div className="bg-white shadow-sm mx-auto max-w-4xl" style={{ fontFamily: 'Times New Roman, serif' }}>

      {/* ── CABEÇALHO EMPRESA ── */}
      <div className="rounded-t-xl overflow-hidden" style={{ background: '#0f0f0f' }}>
        <div className="px-8 py-5 flex items-center justify-between gap-6">
          <div className="flex flex-col items-start shrink-0">
            <div className="flex items-baseline gap-0 leading-none" style={{ fontFamily: 'Arial Black, sans-serif' }}>
              <span className="text-2xl font-black tracking-tight" style={{ color: '#b0b8c1', letterSpacing: '-0.02em' }}>PS</span>
              <span className="text-2xl font-black tracking-tight" style={{ color: '#c8a550', letterSpacing: '-0.02em' }}>X</span>
            </div>
            <div className="w-full h-px my-1" style={{ background: 'linear-gradient(to right, #c8a550, transparent)' }} />
            <div className="text-xs font-bold tracking-widest uppercase" style={{ color: '#888', letterSpacing: '0.25em' }}>Capital</div>
            {companyDoc && (
              <div className="text-xs mt-1.5 font-mono" style={{ color: '#666' }}>CNPJ/CPF: {companyDoc}</div>
            )}
          </div>

          <div className="w-px self-stretch mx-3" style={{ background: '#2a2a2a' }} />

          <div className="text-right flex-1">
            <div className="text-sm font-bold uppercase tracking-widest" style={{ color: '#e0e0e0' }}>
              Instrumento de Cessão de Crédito
            </div>
            <div className="text-xs mt-0.5" style={{ color: '#666' }}>
              com Coobrigação do Cedente
            </div>
            <div className="flex flex-col items-end gap-1 mt-1.5">
              {num_promissoria && (
                <div className="text-xs font-mono px-2 py-0.5 rounded inline-block"
                  style={{ color: '#c8a550', background: '#1a1500', border: '1px solid #3a2e00' }}>
                  Promissória Nº {num_promissoria}
                </div>
              )}
              {num_operacao && (
                <div className="text-xs font-mono px-2 py-0.5 rounded inline-block"
                  style={{ color: '#aaa', background: '#1a1a1a', border: '1px solid #333' }}>
                  Operação Nº {num_operacao}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="px-10 py-8 print:px-8 print:py-6 border border-t-0 border-gray-200 rounded-b-xl">

        {/* Qualificação das Partes */}
        <div className="mb-6 p-5 bg-gray-50 rounded-lg border border-gray-200">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">Qualificação das Partes</p>

          <P>
            <Bold>CEDENTE:</Bold> {cedente_nome || '_______________'}, portador do CPF/CNPJ nº {cedente_doc || '_______________'}{cedente_rg ? `, RG nº ${cedente_rg}` : ''}, residente e domiciliado{cedente_endereco ? ` na ${cedente_endereco}` : ''}{cedente_cidade ? `, ${cedente_cidade}` : ''}{cedente_estado ? `/${cedente_estado}` : ''}, doravante denominado simplesmente <Bold>CEDENTE</Bold>.
          </P>

          <P>
            <Bold>CESSIONÁRIA:</Bold> {companyName}, pessoa jurídica de direito privado, inscrita no CNPJ sob o nº {companyDoc || '_______________'}, com sede{companyAddress ? ` na ${companyAddress}` : ''}, doravante denominada simplesmente <Bold>CESSIONÁRIA</Bold>.
          </P>

          <P className="mb-0">
            <Bold>DEVEDOR CEDIDO:</Bold> {cedido_nome || '_______________'}, portador do CPF/CNPJ nº {cedido_doc || '_______________'}{cedido_rg ? `, RG nº ${cedido_rg}` : ''}, residente e domiciliado{cedido_endereco ? ` na ${cedido_endereco}` : ''}{cedido_cidade ? `, ${cedido_cidade}` : ''}{cedido_estado ? `/${cedido_estado}` : ''}, doravante denominado simplesmente <Bold>DEVEDOR CEDIDO</Bold>.
          </P>
        </div>

        <P>
          As partes acima qualificadas celebram o presente <Bold>Instrumento Particular de Cessão de Crédito com Coobrigação</Bold>, que se regerá pelas cláusulas e condições a seguir estipuladas, as quais as partes aceitam e se obrigam a cumprir fielmente, na forma da legislação civil vigente, em especial os artigos 286 a 298 do Código Civil Brasileiro.
        </P>

        {/* CLÁUSULA 1 — Objeto do Contrato */}
        <Clausula num={nextClausula('Do Objeto do Contrato')} titulo="Do Objeto do Contrato">
          <P>O <Bold>CEDENTE</Bold> declara ser legítimo titular de crédito líquido, certo e exigível perante o <Bold>DEVEDOR CEDIDO</Bold>, originário de operação comercial ou financeira celebrada entre ambos.</P>
          <P>Pelo presente instrumento, o <Bold>CEDENTE</Bold> transfere à <Bold>CESSIONÁRIA</Bold>, em caráter irrevogável e irretratável, todos os direitos creditórios relativos aos títulos, parcelas ou recebíveis vinculados à presente operação, nos termos do artigo 286 do Código Civil.</P>
          <P>A cessão compreende o principal, encargos, garantias e todos os acessórios do crédito, incluindo o direito de cobrança judicial e extrajudicial.</P>
        </Clausula>

        {/* CLÁUSULA 2 — Identificação dos Créditos Cedidos */}
        <Clausula num={nextClausula('Da Identificação dos Créditos Cedidos')} titulo="Da Identificação dos Créditos Cedidos">
          <P>Os créditos objeto da presente cessão estão assim identificados:</P>

          {schedule.length > 0 ? (
            <div className="overflow-x-auto mb-3">
              <table className="w-full text-xs border border-gray-300 rounded-lg overflow-hidden">
                <thead className="bg-gray-100">
                  <tr>
                    {['Parcela', 'Vencimento', 'Valor'].map(h => (
                      <th key={h} className="px-3 py-2 text-left font-bold text-gray-700 border-b border-gray-300">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {schedule.map((p, i) => (
                    <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="px-3 py-1.5 border-b border-gray-200">{p.number || i + 1}ª</td>
                      <td className="px-3 py-1.5 border-b border-gray-200 font-semibold">{p.due_date ? fmtDate(p.due_date) : '—'}</td>
                      <td className="px-3 py-1.5 border-b border-gray-200 font-semibold">{formatCurrency(p.value)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-100">
                  <tr>
                    <td colSpan={2} className="px-3 py-2 font-bold text-right text-xs">Total Nominal:</td>
                    <td className="px-3 py-2 font-bold text-xs">{formatCurrency(valor_nominal)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : (
            <P>Crédito de pagamento único no valor nominal de <Bold>{formatCurrency(valor_nominal)}</Bold> com vencimento em <Bold>{fmtDate(data_vencimento) || '___/___/______'}</Bold>.</P>
          )}

          <div className="grid grid-cols-2 gap-2 text-xs mt-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
            <div><span className="text-gray-500">Nº da Operação:</span> <span className="font-semibold">{num_operacao || '—'}</span></div>
            <div><span className="text-gray-500">Devedor Cedido:</span> <span className="font-semibold">{cedido_nome || '—'}</span></div>
            {cedido_doc && <div><span className="text-gray-500">Doc. Devedor:</span> <span className="font-semibold">{cedido_doc}</span></div>}
            <div><span className="text-gray-500">Quantidade:</span> <span className="font-semibold">{schedule.length || 1} parcela(s)</span></div>
          </div>
        </Clausula>

        {/* CLÁUSULA 3 — Preço da Cessão */}
        <Clausula num={nextClausula('Do Preço da Cessão')} titulo="Do Preço da Cessão">
          <P>A <Bold>CESSIONÁRIA</Bold> pagará ao <Bold>CEDENTE</Bold> o valor líquido da operação após a aplicação do deságio comercial pactuado entre as partes, conforme abaixo:</P>

          <div className="overflow-x-auto mb-3">
            <table className="w-full text-xs border border-gray-300 rounded-lg overflow-hidden">
              <thead className="bg-gray-100">
                <tr>
                  {['Descrição', 'Valor'].map(h => (
                    <th key={h} className="px-3 py-2 text-left font-bold text-gray-700 border-b border-gray-300">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="bg-white">
                  <td className="px-3 py-1.5 border-b border-gray-200">Valor Nominal dos Créditos</td>
                  <td className="px-3 py-1.5 border-b border-gray-200 font-semibold">{formatCurrency(valor_nominal)}</td>
                </tr>
                <tr className="bg-gray-50">
                  <td className="px-3 py-1.5 border-b border-gray-200">Taxa Aplicada ({taxa_pct}% a.m.)</td>
                  <td className="px-3 py-1.5 border-b border-gray-200">—</td>
                </tr>
                <tr className="bg-white">
                  <td className="px-3 py-1.5 border-b border-gray-200">Deságio Comercial</td>
                  <td className="px-3 py-1.5 border-b border-gray-200 font-semibold text-[hsl(43,65%,47%)]">− {formatCurrency(desagio_valor)}</td>
                </tr>
                <tr className="bg-gray-50">
                  <td className="px-3 py-1.5 border-b border-gray-200 font-bold">Valor Líquido Repassado ao Cedente</td>
                  <td className="px-3 py-1.5 border-b border-gray-200 font-bold text-emerald-700">{formatCurrency(valor_liquido)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <P>
            O deságio aplicado possui natureza estritamente comercial de antecipação de recebíveis, <Bold>não constituindo operação de empréstimo ou financiamento</Bold>, sendo resultado da livre negociação entre as partes.
          </P>
          <P>O valor líquido acima será creditado ao <Bold>CEDENTE</Bold> na data de <Bold>{fmtDate(data_liberacao) || '___/___/______'}</Bold>, conforme acordado entre as partes.</P>
        </Clausula>

        {/* CLÁUSULA 4 — Coobrigação do Cedente */}
        <Clausula num={nextClausula('Da Coobrigação do Cedente')} titulo="Da Coobrigação do Cedente">
          <P>O <Bold>CEDENTE</Bold> permanece solidariamente responsável pela liquidação integral dos créditos ora cedidos, nos termos do artigo 296 do Código Civil, respondendo pela solvência do <Bold>DEVEDOR CEDIDO</Bold>.</P>
          <P>Caso ocorra qualquer das seguintes hipóteses:</P>
          <div className="pl-5 mb-3 space-y-1">
            <P className="mb-1"><Bold>a)</Bold> Inadimplemento total ou parcial pelo Devedor Cedido;</P>
            <P className="mb-1"><Bold>b)</Bold> Cancelamento, contestação ou inexistência da dívida originária;</P>
            <P className="mb-1"><Bold>c)</Bold> Fraude, simulação ou vício na origem do crédito;</P>
            <P className="mb-1"><Bold>d)</Bold> Sustaçao, revogação ou impossibilidade de cobrança;</P>
          </div>
          <P>a <Bold>CESSIONÁRIA</Bold> poderá exigir imediatamente do <Bold>CEDENTE</Bold> o pagamento do saldo devedor atualizado, acrescido dos encargos previstos neste instrumento.</P>
        </Clausula>

        {/* CLÁUSULA 5 — Recompra Obrigatória (NOVA) */}
        <Clausula num={nextClausula('Da Recompra Obrigatória')} titulo="Da Recompra Obrigatória">
          <P>Em caso de inadimplemento total ou parcial dos créditos cedidos por período superior a <Bold>{diasRecompra} ({numExtenso(parseInt(diasRecompra))})</Bold> dias, o <Bold>CEDENTE</Bold> obriga-se a recomprar integralmente os créditos objeto da presente cessão.</P>
          <P>A recompra ocorrerá mediante pagamento imediato do saldo devedor atualizado, acrescido de encargos contratuais, despesas de cobrança, protesto, honorários e demais custos suportados pela <Bold>CESSIONÁRIA</Bold>.</P>
          <P>O valor da recompra corresponderá ao saldo devedor total dos créditos inadimplidos na data do evento, acrescido de multa de <Bold>{multa_pct || '2'}%</Bold>, juros de mora de <Bold>{mora_pct || '1'}% ao mês</Bold>, correção monetária, honorários de cobrança de <Bold>{honorarioCobranca}%</Bold> e demais encargos previstos neste instrumento.</P>
        </Clausula>

        {/* CLÁUSULA 6 — Vencimento Antecipado (NOVA) */}
        <Clausula num={nextClausula('Do Vencimento Antecipado')} titulo="Do Vencimento Antecipado">
          <P>Independentemente de aviso ou notificação, considerar-se-á vencida antecipadamente toda obrigação decorrente da presente operação nas seguintes hipóteses:</P>
          <div className="pl-5 mb-3 space-y-1">
            <P className="mb-1"><Bold>a)</Bold> Fraude ou falsidade documental;</P>
            <P className="mb-1"><Bold>b)</Bold> Inexistência do crédito cedido;</P>
            <P className="mb-1"><Bold>c)</Bold> Insolvência civil do cedente;</P>
            <P className="mb-1"><Bold>d)</Bold> Recuperação judicial ou extrajudicial;</P>
            <P className="mb-1"><Bold>e)</Bold> Falência;</P>
            <P className="mb-1"><Bold>f)</Bold> Dissolução da pessoa jurídica;</P>
            <P className="mb-1"><Bold>g)</Bold> Protestos ou restrições que comprometam a solvência do cedente;</P>
            <P className="mb-0"><Bold>h)</Bold> Descumprimento de qualquer obrigação contratual.</P>
          </div>
          <P>Verificada qualquer das hipóteses acima, a <Bold>CESSIONÁRIA</Bold> poderá exigir do <Bold>CEDENTE</Bold>, de imediato, o pagamento integral do saldo devedor atualizado, acrescido de todos os encargos previstos neste instrumento.</P>
        </Clausula>

        {/* CLÁUSULA 7 — Declarações do Cedente */}
        <Clausula num={nextClausula('Das Declarações do Cedente')} titulo="Das Declarações do Cedente">
          <P>O <Bold>CEDENTE</Bold> declara e garante, sob as penas da lei, que:</P>
          <div className="pl-5 mb-3 space-y-1">
            <P className="mb-1"><Bold>a)</Bold> Os créditos cedidos existem, são legítimos e estão em plena vigência;</P>
            <P className="mb-1"><Bold>b)</Bold> Os créditos não foram cedidos anteriormente a terceiros, total ou parcialmente;</P>
            <P className="mb-1"><Bold>c)</Bold> Não há disputa judicial, administrativa ou arbitral sobre os valores cedidos;</P>
            <P className="mb-1"><Bold>d)</Bold> Os créditos são livres de quaisquer ônus, gravames ou restrições;</P>
            <P className="mb-0"><Bold>e)</Bold> Possui documentos que comprovam a origem e a regularidade da obrigação perante o <Bold>DEVEDOR CEDIDO</Bold>.</P>
          </div>
        </Clausula>

        {/* CLÁUSULA 8 — Documentos Comprobatórios */}
        <Clausula num={nextClausula('Dos Documentos Comprobatórios')} titulo="Dos Documentos Comprobatórios">
          <P>A presente cessão poderá ser acompanhada dos seguintes documentos, que passam a integrar este instrumento para todos os fins probatórios:</P>
          <div className="pl-5 mb-3 space-y-1">
            <P className="mb-1"><Bold>a)</Bold> Contrato comercial ou instrumento que deu origem ao crédito;</P>
            <P className="mb-1"><Bold>b)</Bold> Pedido de venda, nota fiscal, duplicata ou fatura correspondente;</P>
            <P className="mb-1"><Bold>c)</Bold> Recibos, comprovantes de entrega ou documentos anexados ao sistema;</P>
            <P className="mb-0"><Bold>d)</Bold> Quaisquer outros documentos que atestem a existência e legitimidade da obrigação.</P>
          </div>
        </Clausula>

        {/* CLÁUSULA 9 — Autorização de Cobrança */}
        <Clausula num={nextClausula('Da Autorização de Cobrança')} titulo="Da Autorização de Cobrança">
          <P>O <Bold>CEDENTE</Bold> autoriza expressamente a <Bold>CESSIONÁRIA</Bold> a, em seu nome ou em nome próprio, realizar:</P>
          <div className="pl-5 mb-3 space-y-1">
            <P className="mb-1"><Bold>a)</Bold> Emissão de boletos bancários para cobrança dos créditos cedidos;</P>
            <P className="mb-1"><Bold>b)</Bold> Cobranças extrajudiciais, por qualquer meio de comunicação;</P>
            <P className="mb-1"><Bold>c)</Bold> Protesto dos títulos em caso de inadimplemento;</P>
            <P className="mb-1"><Bold>d)</Bold> Notificações formais ao Devedor Cedido;</P>
            <P className="mb-0"><Bold>e)</Bold> Registro em plataformas e bureaus de cobrança e proteção ao crédito.</P>
          </div>
        </Clausula>

        {/* CLÁUSULA 10 — Honorários de Cobrança (NOVA) */}
        <Clausula num={nextClausula('Dos Honorários de Cobrança')} titulo="Dos Honorários de Cobrança">
          <P>Além dos encargos previstos neste instrumento, serão devidos honorários de cobrança equivalentes a <Bold>{honorarioCobranca}% ({numExtenso(parseFloat(honorarioCobranca))} por cento)</Bold> sobre o saldo atualizado, a título de honorários de cobrança extrajudicial e judicial, nos termos do artigo 389 e seguintes do Código Civil.</P>
          <div className="grid grid-cols-3 gap-3 mt-3 p-3 bg-gray-50 rounded-lg border border-gray-200 text-xs">
            <div><span className="text-gray-500">Multa Contratual:</span> <strong>{multa_pct || '2'}%</strong></div>
            <div><span className="text-gray-500">Juros de Mora:</span> <strong>{mora_pct || '1'}% a.m.</strong></div>
            <div><span className="text-gray-500">Honorários:</span> <strong>{honorarioCobranca}%</strong></div>
          </div>
        </Clausula>

        {/* CLÁUSULA 11 — Notificação ao Devedor */}
        <Clausula num={nextClausula('Da Notificação ao Devedor Cedido')} titulo="Da Notificação ao Devedor Cedido">
          <P>A <Bold>CESSIONÁRIA</Bold> poderá, a qualquer tempo, notificar o <Bold>DEVEDOR CEDIDO</Bold> acerca da presente cessão de crédito, nos termos do artigo 290 do Código Civil.</P>
          <P>Após a notificação, todos os pagamentos referentes aos créditos cedidos deverão ser realizados exclusivamente em favor da <Bold>CESSIONÁRIA</Bold>, não produzindo efeitos liberatórios quaisquer pagamentos feitos ao <Bold>CEDENTE</Bold> ou a terceiros.</P>
        </Clausula>

        {/* CLÁUSULA 12 — Nota Promissória (FORTALECIDA) */}
        {num_promissoria && (
          <Clausula num={nextClausula('Da Nota Promissória Vinculada')} titulo="Da Nota Promissória Vinculada">
            <P>Como garantia adicional da coobrigação assumida, o <Bold>CEDENTE</Bold> emite e entrega à <Bold>CESSIONÁRIA</Bold> a Nota Promissória de nº <Bold>{num_promissoria}</Bold>, no valor de <Bold>{formatCurrency(valor_nominal)}</Bold>, com vencimento vinculado ao inadimplemento dos créditos cedidos, na forma do artigo 784, inciso I, do Código de Processo Civil.</P>
            <P>A referida Nota Promissória somente será devolvida ao <Bold>CEDENTE</Bold> após a integral liquidação dos créditos cedidos pelo <Bold>DEVEDOR CEDIDO</Bold>.</P>
            <P className="font-bold">A Nota Promissória possui natureza autônoma, independente e complementar ao presente contrato, podendo ser executada isoladamente pela <Bold>CESSIONÁRIA</Bold>, independentemente da demonstração da relação jurídica subjacente.</P>
          </Clausula>
        )}

        {/* CLÁUSULA 13 — Inadimplemento */}
        <Clausula num={nextClausula('Do Inadimplemento')} titulo="Do Inadimplemento">
          <P>Ocorrendo atraso superior a <Bold>{prazo_atraso || '3'} ({numExtenso(parseInt(prazo_atraso || '3'))})</Bold> dias no pagamento pelo <Bold>DEVEDOR CEDIDO</Bold>, ou configurada qualquer hipótese prevista na Cláusula Quarta ou Quinta, incidirão automaticamente, sem necessidade de notificação extrajudicial:</P>
          <div className="pl-5 mb-3 space-y-1">
            <P className="mb-1"><Bold>a)</Bold> Multa contratual de <Bold>{multa_pct || '2'}%</Bold> ({numExtenso(parseFloat(multa_pct || '2'))} por cento) sobre o saldo devedor atualizado; e</P>
            <P className="mb-1"><Bold>b)</Bold> Juros de mora de <Bold>{mora_pct || '1'}% ao mês</Bold> ({numExtenso(parseFloat(mora_pct || '1'))} por cento ao mês), calculados pro rata die;</P>
            <P className="mb-0"><Bold>c)</Bold> Correção monetária pelo índice oficial aplicável.</P>
          </div>
          <P>Configurado o inadimplemento, a <Bold>CESSIONÁRIA</Bold> poderá exigir do <Bold>CEDENTE</Bold>, de imediato, o pagamento integral do saldo devedor atualizado, acrescido dos encargos previstos nesta cláusula, acrescido de honorários de cobrança judicial e extrajudicial.</P>
        </Clausula>

        {/* CLÁUSULA 14 — Confissão de Dívida Vinculada */}
        <Clausula num={nextClausula('Da Confissão de Dívida Vinculada')} titulo="Da Confissão de Dívida Vinculada">
          <P>O <Bold>CEDENTE</Bold> reconhece e confessa ser devedor da <Bold>CESSIONÁRIA</Bold>, de forma irrevogável e irretratável, em caso de inadimplemento dos créditos cedidos pelo <Bold>DEVEDOR CEDIDO</Bold>.</P>
          <P>O valor devido corresponderá ao saldo atualizado da operação na data da exigibilidade, calculado com base no valor nominal dos créditos inadimplidos, acrescido dos encargos previstos neste instrumento.</P>
          <P>A presente cláusula constitui <Bold>título executivo extrajudicial</Bold>, nos termos do artigo 784, inciso III, do Código de Processo Civil.</P>
        </Clausula>

        {/* CLÁUSULA 15 — LGPD (NOVA) */}
        <Clausula num={nextClausula('Da Proteção de Dados — LGPD')} titulo="Da Proteção de Dados — LGPD">
          <P>As partes autorizam o tratamento, armazenamento e compartilhamento dos dados pessoais e empresariais necessários à análise, contratação, monitoramento, cobrança e execução da presente operação, nos termos da Lei nº 13.709/2018 (Lei Geral de Proteção de Dados Pessoais — LGPD).</P>
          <P>Os dados serão tratados exclusivamente para as finalidades previstas neste instrumento, pelo prazo necessário ao cumprimento das obrigações contratuais e legais, sendo vedado o compartilhamento com terceiros não autorizados, ressalvadas as hipóteses legais e as previstas neste contrato.</P>
          <P>O <Bold>CEDENTE</Bold> declara-se ciente de que seus dados poderão ser compartilhados com bureaus de crédito, instituições financeiras, securitizadoras, fundos de investimento e demais parceiros comerciais da <Bold>CESSIONÁRIA</Bold>, exclusivamente para fins de análise de crédito, cessão de direitos creditórios e proteção ao crédito.</P>
        </Clausula>

        {/* CLÁUSULA 16 — Consultas Cadastrais (NOVA) */}
        <Clausula num={nextClausula('Da Autorização de Consultas Cadastrais')} titulo="Da Autorização de Consultas Cadastrais">
          <P>O <Bold>CEDENTE</Bold> autoriza expressamente a <Bold>PSX CAPITAL</Bold> a realizar consultas cadastrais, patrimoniais, financeiras e creditícias em órgãos públicos e privados, incluindo, mas não se limitando a:</P>
          <div className="pl-5 mb-3 space-y-1">
            <P className="mb-1"><Bold>a)</Bold> Serasa Experian;</P>
            <P className="mb-1"><Bold>b)</Bold> Boa Vista SCPC;</P>
            <P className="mb-1"><Bold>c)</Bold> Quod (DataWise);</P>
            <P className="mb-1"><Bold>d)</Bold> Sistemas de Open Finance;</P>
            <P className="mb-0"><Bold>e)</Bold> Registros públicos, cartórios, tribunais e demais sistemas de proteção ao crédito.</P>
          </div>
          <P>A presente autorização abrange consultas prévias à contratação, durante a vigência da operação e após o vencimento, para fins de monitoramento de risco, cobrança e recuperação de crédito.</P>
        </Clausula>

        {/* CLÁUSULA 17 — Cessão Futura (NOVA) */}
        <Clausula num={nextClausula('Da Cessão Futura dos Créditos')} titulo="Da Cessão Futura dos Créditos">
          <P>A <Bold>CESSIONÁRIA</Bold> poderá ceder, transferir, negociar, securitizar ou utilizar os créditos decorrentes desta operação perante terceiros, fundos de investimento, securitizadoras, instituições financeiras ou investidores, independentemente de nova autorização do <Bold>CEDENTE</Bold>.</P>
          <P>O <Bold>CEDENTE</Bold> desde já autoriza, de forma irrevogável e irretratável, a cessão, transferência ou negociação total ou parcial dos direitos creditórios decorrentes deste instrumento, obrigando-se a praticar todos os atos necessários à efetivação de tais operações, quando solicitado pela <Bold>CESSIONÁRIA</Bold>.</P>
        </Clausula>

        {/* CLÁUSULA 18 — Assinatura Eletrônica */}
        <Clausula num={nextClausula('Da Assinatura')} titulo="Da Assinatura">
          <P>O presente contrato poderá ser assinado eletrônica, digital ou presencialmente, conforme legislação brasileira aplicável, em especial a Medida Provisória nº 2.200-2/2001 e a Lei nº 14.063/2020.</P>
          <P>A assinatura eletrônica, em qualquer de suas modalidades, possui plena validade jurídica e produz todos os efeitos legais, equivalendo à assinatura de próprio punho para todos os fins de direito.</P>
        </Clausula>

        {/* CLÁUSULA 19 — Foro de Eleição */}
        <Clausula num={nextClausula('Do Foro de Eleição')} titulo="Do Foro de Eleição">
          <P>Para dirimir quaisquer controvérsias decorrentes do presente instrumento, as partes elegem o foro da comarca de <Bold>{praça}</Bold>, Estado de <Bold>{cedente_estado || '___'}</Bold>, com renúncia expressa a qualquer outro, por mais privilegiado que seja.</P>
        </Clausula>

        {/* Local, data e assinaturas */}
        <div className="mt-8 pt-6 border-t border-gray-300">
          <p className="text-sm text-center text-gray-700 mb-8">
            {praça}, {hoje}.
          </p>

          <div className="grid grid-cols-2 gap-6 mt-10">
            <div className="text-center">
              <div className="border-t border-gray-800 pt-2 mt-12">
                <p className="text-sm font-bold">{cedente_nome || '_______________'}</p>
                <p className="text-xs text-gray-600">CEDENTE</p>
                <p className="text-xs text-gray-500">CPF/CNPJ: {cedente_doc || '_______________'}</p>
              </div>
            </div>
            <div className="text-center">
              <div className="border-t border-gray-800 pt-2 mt-12">
                <p className="text-sm font-bold">{companyName}</p>
                <p className="text-xs text-gray-600">CESSIONÁRIA</p>
                <p className="text-xs text-gray-500">CNPJ: {companyDoc || '_______________'}</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-8 mt-10">
            <div className="text-center">
              <div className="mt-12" style={{ borderTop: '2px solid #1f2937', paddingTop: '8px', width: '100%' }}>
                <p className="text-sm font-bold">{test1_nome || '_______________'}</p>
                <p className="text-xs text-gray-600">TESTEMUNHA 1</p>
                <p className="text-xs text-gray-500">CPF: {test1_cpf || '_______________'}</p>
              </div>
            </div>
            <div className="text-center">
              <div className="mt-12" style={{ borderTop: '2px solid #1f2937', paddingTop: '8px', width: '100%' }}>
                <p className="text-sm font-bold">{test2_nome || '_______________'}</p>
                <p className="text-xs text-gray-600">TESTEMUNHA 2</p>
                <p className="text-xs text-gray-500">CPF: {test2_cpf || '_______________'}</p>
              </div>
            </div>
          </div>
        </div>

        {/* ── RODAPÉ ── */}
        <div className="mt-8 pt-4 border-t border-gray-200 flex items-center justify-between gap-4 flex-wrap">
         <div className="text-xs text-gray-400">
           <div>{companyName}{companyDoc ? ` — ${companyDoc}` : ''}</div>
           <div>Documento gerado em {hoje}</div>
           {document_hash && (
             <div className="font-mono text-[10px] mt-1 text-gray-400">Hash: {document_hash.substring(0, 32)}…</div>
           )}
         </div>
         <div className="flex flex-col items-center gap-1">
           <QRCodeSVG value={qrUrl} size={68} level="M" />
           <span className="text-xs text-gray-400 text-center">Verificar Autenticidade</span>
         </div>
        </div>

      </div>
    </div>
  );
}