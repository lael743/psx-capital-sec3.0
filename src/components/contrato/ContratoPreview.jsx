import { QRCodeSVG } from 'qrcode.react';
import { formatCurrency } from '@/lib/finance';
import { numPorExtenso as defaultNumPorExtenso, numExtenso } from '@/lib/numPorExtenso';

const STORAGE_KEY = 'psx_company_settings';
function getSettings() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; }
}

export default function ContratoPreview({ dados, fmtDate, numPorExtenso: numPorExtensoProps }) {
  const numPorExtenso = numPorExtensoProps || defaultNumPorExtenso;
  const s = getSettings();
  const {
    credor_nome, credor_doc, credor_rg, credor_endereco, credor_cidade, credor_estado,
    devedor_nome, devedor_doc, devedor_rg, devedor_endereco, devedor_cidade, devedor_estado,
    valorLiberado, valorFinal, acrescimoValor, acrescimoPct, prazoDias,
    data_liberacao, data_vencimento, num_promissoria, num_operacao,
    multa_pct, mora_pct, prazo_atraso,
    foro_cidade,
    test1_nome, test1_cpf, test2_nome, test2_cpf,
    operacao, cheques,
    validacao_url,
    incluir_avalista,
    avalista_nome, avalista_doc, avalista_rg, avalista_endereco, avalista_cidade, avalista_estado,
    document_hash,
  } = dados;

  const qrUrl = validacao_url || `${window.location.origin}/validar`;

  const isCheque = operacao?.type === 'cheque';
  const isEmprestimo = operacao?.type === 'emprestimo';
  const schedule = operacao?.installment_schedule || [];

  // Estrutura "Capital no Vencimento + Deságio Parcelado"
  const isCapitalDesagio = isEmprestimo && operacao?.calc_mode === 'capital_desagio';
  const cdCapital = isCapitalDesagio ? (operacao?.gross_value || valorLiberado || 0) : 0;
  const cdDesagio = isCapitalDesagio ? Math.max(0, (operacao?.total_receivable || valorFinal || 0) - cdCapital) : 0;
  const cdDesagioPer = (isCapitalDesagio && schedule.length > 0) ? schedule[0].interest : 0;

  const hoje = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
  const praça = foro_cidade || s.company_city || 'CUIABÁ';

  const companyName = s.company_name || 'PSX CAPITAL';
  const companyDoc = s.company_document || '';
  const companyAddress = [s.company_address, s.company_city, s.company_state].filter(Boolean).join(', ');
  const companyPhone = s.company_phone || '';
  const companyEmail = s.company_email || '';
  const companyLogo = s.company_logo_url || '';

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

  return (
    <div className="bg-white shadow-sm mx-auto max-w-4xl" style={{ fontFamily: 'Times New Roman, serif' }}>

      {/* ── CABEÇALHO EMPRESA ── */}
      <div className="rounded-t-xl overflow-hidden" style={{ background: '#0f0f0f' }}>
        <div className="px-8 py-5 flex items-center justify-between gap-6">
          {/* Wordmark PSX Capital */}
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

          {/* Divisor vertical */}
          <div className="w-px self-stretch mx-3" style={{ background: '#2a2a2a' }} />

          {/* Título do documento */}
          <div className="text-right flex-1">
            <div className="text-sm font-bold uppercase tracking-widest" style={{ color: '#e0e0e0' }}>
              Contrato de Confissão de Dívida
            </div>
            {!isCheque && (
              <div className="text-xs mt-0.5" style={{ color: '#666' }}>
                com Cláusula de Garantia por Nota Promissória
              </div>
            )}
            {isCheque && (
              <div className="text-xs mt-0.5" style={{ color: '#666' }}>
                com Garantia por Cheques
              </div>
            )}
            <div className="flex flex-col items-end gap-1 mt-1.5">
              {!isCheque && num_promissoria && (
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

        {/* Barra de contatos */}
        {(companyAddress || companyPhone || companyEmail) && (
          <div className="px-8 py-2.5 flex flex-wrap gap-5 text-xs" style={{ borderTop: '1px solid #1e1e1e', background: '#0a0a0a' }}>
            {companyAddress && (
              <span className="flex items-center gap-1.5" style={{ color: '#888' }}>
                <span style={{ color: '#c8a550' }}>📍</span> {companyAddress}
              </span>
            )}
            {companyPhone && (
              <span className="flex items-center gap-1.5" style={{ color: '#888' }}>
                <span style={{ color: '#c8a550' }}>📞</span> {companyPhone}
              </span>
            )}
            {companyEmail && (
              <span className="flex items-center gap-1.5" style={{ color: '#888' }}>
                <span style={{ color: '#c8a550' }}>✉️</span> {companyEmail}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="px-10 py-8 print:px-8 print:py-6 border border-t-0 border-gray-200 rounded-b-xl">

        {/* Qualificação das Partes */}
        <div className="mb-6 p-5 bg-gray-50 rounded-lg border border-gray-200">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">Qualificação das Partes</p>
          <P>
            <Bold>CREDOR:</Bold> {credor_nome || '_______________'}, portador do CPF/CNPJ nº {credor_doc || '_______________'}{credor_rg ? `, RG nº ${credor_rg}` : ''}, residente e domiciliado{credor_endereco ? ` na ${credor_endereco}` : ''}{credor_cidade ? `, ${credor_cidade}` : ''}{credor_estado ? `/${credor_estado}` : ''}, doravante denominado simplesmente <Bold>CREDOR</Bold>.
          </P>
          <P className="mb-0">
            <Bold>DEVEDOR:</Bold> {devedor_nome || '_______________'}, portador do CPF/CNPJ nº {devedor_doc || '_______________'}{devedor_rg ? `, RG nº ${devedor_rg}` : ''}, residente e domiciliado{devedor_endereco ? ` na ${devedor_endereco}` : ''}{devedor_cidade ? `, ${devedor_cidade}` : ''}{devedor_estado ? `/${devedor_estado}` : ''}, doravante denominado simplesmente <Bold>DEVEDOR</Bold>.
          </P>
          {incluir_avalista && avalista_nome && (
            <P className="mb-0 mt-3 pt-3 border-t border-dashed border-gray-300">
              <Bold>AVALISTA (GARANTIDOR):</Bold> {avalista_nome}, portador do CPF/CNPJ nº {avalista_doc || '_______________'}{avalista_rg ? `, RG nº ${avalista_rg}` : ''}, residente e domiciliado{avalista_endereco ? ` na ${avalista_endereco}` : ''}{avalista_cidade ? `, ${avalista_cidade}` : ''}{avalista_estado ? `/${avalista_estado}` : ''}, na qualidade de <Bold>AVALISTA</Bold> e principal pagador, nos termos do artigo 898 do Código Civil e artigo 30 do Decreto nº 57.663/1966 (Lei Uniforme de Genebra), assumindo solidariamente com o <Bold>DEVEDOR</Bold> a responsabilidade integral pelo pagamento da obrigação ora confessada, renunciando expressamente ao benefício de ordem.
            </P>
          )}
        </div>

        <P>
          As partes acima qualificadas celebram o presente <Bold>Contrato de Confissão de Dívida</Bold>, que se regerá pelas cláusulas e condições a seguir estipuladas, as quais as partes aceitam e se obrigam a cumprir fielmente, na forma da legislação civil vigente.
        </P>

        {/* Cláusulas */}
        <Clausula num="PRIMEIRA" titulo="Da Confissão de Dívida">
          <P>O <Bold>DEVEDOR</Bold>, de forma livre, espontânea, irrevogável e irretratável, confessa dever ao <Bold>CREDOR</Bold> a quantia descrita na Cláusula Terceira deste instrumento, oriunda de obrigação financeira contraída entre as partes, renunciando expressamente ao benefício de ordem e a qualquer exceção ou defesa que possa ser oposta ao presente título.</P>
        </Clausula>

        <Clausula num="SEGUNDA" titulo="Do Reconhecimento do Recebimento">
          <P>O <Bold>DEVEDOR</Bold> declara, para todos os fins de direito, que recebeu do <Bold>CREDOR</Bold>, neste ato ou em data anterior a este instrumento, a quantia de <Bold>{formatCurrency(valorLiberado)}</Bold> ({numPorExtenso(valorLiberado)}), referente ao valor liberado em <Bold>{fmtDate(data_liberacao) || '___/___/______'}</Bold>, estando plenamente satisfeito com o repasse da referida quantia, nada mais tendo a reclamar a título de entrega de valores.</P>
        </Clausula>

        <Clausula num="TERCEIRA" titulo="Do Valor e do Acréscimo Compensatório">
          <P>Em razão do presente instrumento, o <Bold>DEVEDOR</Bold> compromete-se a pagar ao <Bold>CREDOR</Bold> a quantia total de <Bold>{formatCurrency(valorFinal)}</Bold> ({numPorExtenso(valorFinal)}), valor já acrescido do acréscimo compensatório de {acrescimoPct}% ({numExtenso(acrescimoPct)} por cento) ajustado entre as partes, correspondente a {formatCurrency(acrescimoValor)}, resultante da operação financeira privada ora confessada.</P>
          <P>O acréscimo compensatório pactuado neste instrumento constitui remuneração livremente avençada entre as partes, nos termos do artigo 395 e seguintes do Código Civil Brasileiro, não se confundindo com qualquer encargo sancionatório.</P>
        </Clausula>

        {/* Cláusula QUARTA: promissória só quando NÃO é cheque */}
        {!isCheque && (
          <Clausula num="QUARTA" titulo="Da Garantia — Nota Promissória Vinculada">
            <P>Em garantia da obrigação ora confessada, o <Bold>DEVEDOR</Bold> emite e entrega ao <Bold>CREDOR</Bold> a Nota Promissória de nº <Bold>{num_promissoria || '_______________'}</Bold>, no valor de <Bold>{formatCurrency(valorFinal)}</Bold>, com vencimento em <Bold>{fmtDate(data_vencimento) || '___/___/______'}</Bold>, a qual fica vinculada ao presente instrumento como título de garantia, na forma do artigo 784, inciso I, do Código de Processo Civil.</P>
            <P>A referida Nota Promissória somente será devolvida ao <Bold>DEVEDOR</Bold> após a integral quitação da obrigação ora confessada, vedada qualquer compensação unilateral.</P>
          </Clausula>
        )}

        <Clausula num={isCheque ? 'QUARTA' : 'QUINTA'} titulo="Do Vencimento e da Forma de Pagamento">
          <P>A obrigação ora confessada vencerá em <Bold>{fmtDate(data_vencimento) || '___/___/______'}</Bold>, correspondendo ao prazo de <Bold>{prazoDias} ({numExtenso(prazoDias)})</Bold> dias contados da data da liberação dos valores.</P>
          <P>O pagamento deverá ser efetuado diretamente ao <Bold>CREDOR</Bold>, na forma por este indicada, sendo aceito qualquer meio de pagamento previamente acordado entre as partes.</P>
        </Clausula>

        {/* Cheques como garantia substitui promissória — vira cláusula QUINTA para cheque */}
        {operacao?.type && (
          <Clausula num={isCheque ? 'QUINTA' : 'QUINTA-A'} titulo={isCheque ? 'Dos Cheques Dados em Garantia' : 'Do Cronograma de Pagamento'}>
            {isCheque && cheques && cheques.length > 0 ? (
              <>
                <P>Como instrumento da operação financeira ora confessada, o <Bold>DEVEDOR</Bold> entregou ao <Bold>CREDOR</Bold> os seguintes cheques:</P>
                <div className="overflow-x-auto mb-3">
                  <table className="w-full text-xs border border-gray-300 rounded-lg overflow-hidden">
                    <thead className="bg-gray-100">
                      <tr>
                        {['#', 'Banco', 'Nº Cheque', 'Valor', 'Emissão', 'Compensação'].map(h => (
                          <th key={h} className="px-3 py-2 text-left font-bold text-gray-700 border-b border-gray-300">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {cheques.map((c, i) => (
                        <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                          <td className="px-3 py-1.5 border-b border-gray-200">{i + 1}</td>
                          <td className="px-3 py-1.5 border-b border-gray-200">{c.bank_name || '—'}{c.bank_agency ? ` / Ag. ${c.bank_agency}` : ''}</td>
                          <td className="px-3 py-1.5 border-b border-gray-200 font-mono">{c.check_number || '—'}</td>
                          <td className="px-3 py-1.5 border-b border-gray-200 font-semibold">{formatCurrency(cheques.length === 1 ? valorFinal : c.value)}</td>
                          <td className="px-3 py-1.5 border-b border-gray-200">{c.issue_date ? fmtDate(c.issue_date) : '—'}</td>
                          <td className="px-3 py-1.5 border-b border-gray-200 font-semibold">{c.compensation_date ? fmtDate(c.compensation_date) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-gray-100">
                      <tr>
                        <td colSpan={3} className="px-3 py-2 font-bold text-right text-xs">Total:</td>
                        <td colSpan={3} className="px-3 py-2 font-bold text-xs">{formatCurrency(cheques.length === 1 ? valorFinal : cheques.reduce((s, c) => s + (c.value || 0), 0))}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                <P>O valor do cheque corresponde ao montante integral da dívida confessada neste instrumento, conforme Cláusula Terceira, garantindo ao <Bold>CREDOR</Bold> o recebimento do valor total devido pelo <Bold>DEVEDOR</Bold>. Os cheques acima descritos ficarão sob a guarda do <Bold>CREDOR</Bold> até a integral quitação da obrigação, sendo devolvidos ao <Bold>DEVEDOR</Bold> tão somente após a liquidação total do débito.</P>
              </>
            ) : isEmprestimo && isCapitalDesagio && schedule.length > 0 ? (
              <>
                <P>O pagamento da obrigação será realizado da seguinte forma: o <Bold>capital</Bold>, no montante de <Bold>{formatCurrency(cdCapital)}</Bold> ({numPorExtenso(cdCapital)}), será pago em parcela única no <Bold>vencimento da operação</Bold>, em <Bold>{fmtDate(data_vencimento) || '___/___/______'}</Bold>; e o <Bold>deságio</Bold>, no montante de <Bold>{formatCurrency(cdDesagio)}</Bold> ({numPorExtenso(cdDesagio)}), calculado pela fórmula do desconto comercial à taxa de <Bold>{acrescimoPct}% ao mês</Bold>, será pago em <Bold>{schedule.length} ({numExtenso(schedule.length)})</Bold> parcelas mensais e sucessivas de <Bold>{formatCurrency(cdDesagioPer)}</Bold> cada, vencendo a primeira em <Bold>{schedule[0]?.due_date ? fmtDate(schedule[0].due_date) : '___/___/______'}</Bold> e a última em <Bold>{fmtDate(data_vencimento) || '___/___/______'}</Bold>, conjuntamente com o pagamento do capital.</P>
                <div className="overflow-x-auto mb-3">
                  <table className="w-full text-xs border border-gray-300 rounded-lg overflow-hidden">
                    <thead className="bg-gray-100">
                      <tr>
                        {['Parcela', 'Vencimento', 'Deságio', 'Capital', 'Total'].map(h => (
                          <th key={h} className="px-3 py-2 text-left font-bold text-gray-700 border-b border-gray-300">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {schedule.map((p, i) => (
                        <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                          <td className="px-3 py-1.5 border-b border-gray-200">{p.number || i + 1}ª</td>
                          <td className="px-3 py-1.5 border-b border-gray-200 font-semibold">{p.due_date ? fmtDate(p.due_date) : '—'}</td>
                          <td className="px-3 py-1.5 border-b border-gray-200 text-[hsl(43,65%,47%)] font-medium">{formatCurrency(p.interest)}</td>
                          <td className="px-3 py-1.5 border-b border-gray-200">{formatCurrency(p.principal)}</td>
                          <td className="px-3 py-1.5 border-b border-gray-200 font-semibold">{formatCurrency(p.value)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-gray-100">
                      <tr>
                        <td colSpan={2} className="px-3 py-2 font-bold text-right text-xs">Total:</td>
                        <td className="px-3 py-2 font-bold text-xs text-[hsl(43,65%,47%)]">{formatCurrency(cdDesagio)}</td>
                        <td className="px-3 py-2 font-bold text-xs">{formatCurrency(cdCapital)}</td>
                        <td className="px-3 py-2 font-bold text-xs">{formatCurrency(cdCapital + cdDesagio)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </>
            ) : isEmprestimo && schedule.length > 1 ? (
              <>
                <P>O pagamento da obrigação será realizado em <Bold>{schedule.length} ({numExtenso(schedule.length)})</Bold> parcelas, conforme o cronograma abaixo:</P>
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
                        <td colSpan={2} className="px-3 py-2 font-bold text-right text-xs">Total:</td>
                        <td className="px-3 py-2 font-bold text-xs">{formatCurrency(schedule.reduce((s, p) => s + (p.value || 0), 0))}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </>
            ) : (
              <P>Operação de pagamento único no valor de <Bold>{formatCurrency(valorFinal)}</Bold> com vencimento em <Bold>{fmtDate(data_vencimento) || '___/___/______'}</Bold>.</P>
            )}
          </Clausula>
        )}

        <Clausula num={isCheque ? 'SEXTA' : 'SEXTA'} titulo="Da Inadimplência">
          <P>Em caso de atraso superior a <Bold>{prazo_atraso || '3'} ({numExtenso(parseInt(prazo_atraso || '3'))})</Bold> dias no pagamento da obrigação ora confessada, incidirão automaticamente, sem necessidade de notificação extrajudicial, os seguintes encargos moratórios:</P>
          <div className="pl-5 mb-3 space-y-1">
            <P className="mb-1"><Bold>a)</Bold> Multa compensatória de <Bold>{multa_pct || '2'}%</Bold> ({numExtenso(parseFloat(multa_pct || '2'))} por cento) incidente sobre o saldo devedor atualizado; e</P>
            <P className="mb-0"><Bold>b)</Bold> Juros de mora de <Bold>{mora_pct || '1'}% ao mês</Bold> ({numExtenso(parseFloat(mora_pct || '1'))} por cento ao mês), calculados pro rata die, a partir do primeiro dia de atraso até a data do efetivo pagamento.</P>
          </div>
          <P>O não pagamento na data de vencimento importa na constituição em mora do <Bold>DEVEDOR</Bold>, independentemente de interpelação judicial ou extrajudicial, nos termos do artigo 397 do Código Civil.</P>
        </Clausula>

        <Clausula num="SÉTIMA" titulo="Do Vencimento Antecipado">
          <P>Constituem causas de vencimento antecipado da obrigação ora confessada, facultando ao <Bold>CREDOR</Bold> exigir o pagamento integral e imediato do saldo devedor:</P>
          <div className="pl-5 mb-3 space-y-1">
            <P className="mb-1"><Bold>I.</Bold> O descumprimento de qualquer cláusula ou condição do presente instrumento;</P>
            <P className="mb-1"><Bold>II.</Bold> A decretação de falência, insolvência civil ou recuperação judicial do <Bold>DEVEDOR</Bold>;</P>
            <P className="mb-1"><Bold>III.</Bold> A constrição judicial ou extrajudicial de bens do <Bold>DEVEDOR</Bold> que prejudique o cumprimento da obrigação; e</P>
            <P className="mb-0"><Bold>IV.</Bold> Qualquer ato do <Bold>DEVEDOR</Bold> que possa comprometer a garantia oferecida.</P>
          </div>
        </Clausula>

        <Clausula num="OITAVA" titulo="Da Eficácia Executiva">
          <P>O presente instrumento, assinado pelas partes e por duas testemunhas, constitui <Bold>título executivo extrajudicial</Bold> nos termos do artigo 784, inciso III, do Código de Processo Civil, podendo ser executado independentemente de ação ordinária prévia, garantindo ao <Bold>CREDOR</Bold> o direito de promover imediatamente a execução forçada do crédito em caso de inadimplemento.</P>
        </Clausula>

        <Clausula num="NONA" titulo="Do Foro de Eleição">
          <P>Para dirimir quaisquer controvérsias decorrentes do presente instrumento, as partes elegem o foro da comarca de <Bold>{praça}</Bold>, Estado de <Bold>{credor_estado || '___'}</Bold>, com renúncia expressa a qualquer outro, por mais privilegiado que seja.</P>
        </Clausula>

        {/* Local, data e assinaturas */}
        <div className="mt-8 pt-6 border-t border-gray-300">
          <p className="text-sm text-center text-gray-700 mb-8">
            {praça}, {hoje}.
          </p>

          <div className="grid grid-cols-2 gap-8 mt-10">
            <div className="text-center">
              <div className="border-t border-gray-800 pt-2 mt-12">
                <p className="text-sm font-bold">{credor_nome || '_______________'}</p>
                <p className="text-xs text-gray-600">CREDOR</p>
                <p className="text-xs text-gray-500">CPF/CNPJ: {credor_doc || '_______________'}</p>
              </div>
            </div>
            <div className="text-center">
              <div className="border-t border-gray-800 pt-2 mt-12">
                <p className="text-sm font-bold">{devedor_nome || '_______________'}</p>
                <p className="text-xs text-gray-600">DEVEDOR</p>
                <p className="text-xs text-gray-500">CPF/CNPJ: {devedor_doc || '_______________'}</p>
              </div>
            </div>
          </div>
          {incluir_avalista && avalista_nome && (
            <div className="flex justify-center mt-10">
              <div className="text-center w-1/2">
                <div className="border-t border-gray-800 pt-2 mt-12">
                  <p className="text-sm font-bold">{avalista_nome}</p>
                  <p className="text-xs text-gray-600">AVALISTA / GARANTIDOR</p>
                  <p className="text-xs text-gray-500">CPF/CNPJ: {avalista_doc || '_______________'}</p>
                </div>
              </div>
            </div>
          )}

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