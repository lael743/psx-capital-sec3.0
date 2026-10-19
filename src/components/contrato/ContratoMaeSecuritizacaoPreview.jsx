import { QRCodeSVG } from 'qrcode.react';
import { formatCurrency } from '@/lib/finance';

const STORAGE_KEY = 'psx_company_settings';
function getSettings() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; }
}

function fmtDateBR(str) {
  if (!str) return '___/___/______';
  const [y, m, d] = str.split('-');
  return `${d}/${m}/${y}`;
}

function numMes(str) {
  const meses = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
  if (!str) return '';
  const [, m] = str.split('-');
  return meses[parseInt(m, 10) - 1] || '';
}

function fmtDateExtensa(str) {
  if (!str) return '';
  const [y, m, d] = str.split('-');
  return `${parseInt(d, 10)} de ${numMes(str)} de ${y}`;
}

const hoje = () => {
  const d = new Date();
  const meses = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
  return `${d.getDate()} de ${meses[d.getMonth()]} de ${d.getFullYear()}`;
};

const P = ({ children, className = '' }) => (
  <p className={`text-sm leading-relaxed text-gray-800 mb-3 text-justify ${className}`}>{children}</p>
);

const Clausula = ({ num, titulo, children }) => (
  <div className="mb-5">
    <p className="text-sm font-bold text-gray-900 mb-2">
      {num}. CLÁUSULA {num === 1 ? 'PRIMEIRA' : num === 2 ? 'SEGUNDA' : num === 3 ? 'TERCEIRA' : num === 4 ? 'QUARTA' : num === 5 ? 'QUINTA' : num === 6 ? 'SEXTA' : num === 7 ? 'SÉTIMA' : num === 8 ? 'OITAVA' : num === 9 ? 'NONA' : num === 10 ? 'DÉCIMA' : num === 11 ? 'DÉCIMA PRIMEIRA' : num === 12 ? 'DÉCIMA SEGUNDA' : num === 13 ? 'DÉCIMA TERCEIRA' : num === 14 ? 'DÉCIMA QUARTA' : num === 15 ? 'DÉCIMA QUINTA' : num === 16 ? 'DÉCIMA SEXTA' : num === 17 ? 'DÉCIMA SÉTIMA' : num === 18 ? 'DÉCIMA OITAVA' : num === 19 ? 'DÉCIMA NONA' : num === 20 ? 'VIGÉSIMA' : num === 21 ? 'VIGÉSIMA PRIMEIRA' : num === 22 ? 'VIGÉSIMA SEGUNDA' : num === 23 ? 'VIGÉSIMA TERCEIRA' : num} – {titulo}
    </p>
    {children}
  </div>
);

const Bold = ({ children }) => <strong className="font-bold">{children}</strong>;

export default function ContratoMaeSecuritizacaoPreview({ dados, document_number }) {
  const s = getSettings();
  if (!dados) return null;

  const {
    devedor_nome, devedor_doc, devedor_endereco, devedor_cidade, devedor_estado,
    credor_nome, credor_doc, credor_endereco, credor_cidade, credor_estado,
    valorFinal, acrescimoPct,
    foro_cidade,
    validacao_url,
    // pessoas relacionadas (representantes/avalistas) passados opcionalmente
    representantes = [],
    avalistas = [],
    document_hash,
  } = dados;

  const qrUrl = validacao_url || `${window.location.origin}/validar`;

  const companyName = s.company_name || credor_nome || 'PSX CAPITAL';
  const companyDoc = s.company_document || credor_doc || '';
  const companyAddress = [
    s.company_address || credor_endereco,
    s.company_city || credor_cidade,
    s.company_state || credor_estado
  ].filter(Boolean).join(', ');
  const companyRepresentante = s.company_representante || '';
  const foro = foro_cidade || s.company_city || '';
  const dataHoje = hoje();
  const ctrNumber = document_number || '';

  const cedenteCidade = [devedor_cidade, devedor_estado].filter(Boolean).join('/');
  const cedenteEnd = devedor_endereco ? `${devedor_endereco}${cedenteCidade ? ', ' + cedenteCidade : ''}` : cedenteCidade;
  const cedentePhone = dados.devedor_phone || '';
  const creditLimitFmt = formatCurrency(valorFinal || 0);
  const taxaMensal = acrescimoPct ? `${acrescimoPct}% ao mês` : '___% ao mês';

  return (
    <div className="bg-white shadow-sm mx-auto max-w-4xl" style={{ fontFamily: 'Times New Roman, serif' }}>

      {/* Cabeçalho */}
      <div className="rounded-t-xl overflow-hidden" style={{ background: '#0f0f0f' }}>
        <div className="px-8 py-5 flex items-center justify-between gap-6">
          <div className="flex flex-col items-start shrink-0">
            <div className="flex items-baseline gap-0 leading-none" style={{ fontFamily: 'Arial Black, sans-serif' }}>
              <span className="text-2xl font-black tracking-tight" style={{ color: '#b0b8c1' }}>PS</span>
              <span className="text-2xl font-black tracking-tight" style={{ color: '#c8a550' }}>X</span>
            </div>
            <div className="w-full h-px my-1" style={{ background: 'linear-gradient(to right, #c8a550, transparent)' }} />
            <div className="text-xs font-bold tracking-widest uppercase" style={{ color: '#888', letterSpacing: '0.25em' }}>Capital</div>
            {companyDoc && (
              <div className="text-xs mt-1.5 font-mono" style={{ color: '#666' }}>CNPJ: {companyDoc}</div>
            )}
          </div>
          <div className="w-px self-stretch mx-3" style={{ background: '#2a2a2a' }} />
          <div className="text-right flex-1">
            <div className="text-sm font-bold uppercase tracking-widest" style={{ color: '#e0e0e0' }}>
              Instrumento Particular de Contrato
            </div>
            <div className="text-xs mt-0.5" style={{ color: '#aaa' }}>
              Cessão de Direitos Creditórios Sem Coobrigação
            </div>
            {ctrNumber && (
              <div className="flex flex-col items-end gap-1 mt-1.5">
                <div className="text-xs font-mono px-2 py-0.5 rounded inline-block"
                  style={{ color: '#c8a550', background: '#1a1500', border: '1px solid #3a2e00' }}>
                  {ctrNumber}
                </div>
              </div>
            )}
          </div>
        </div>
        {companyAddress && (
          <div className="px-8 py-2.5 flex flex-wrap gap-5 text-xs" style={{ borderTop: '1px solid #1e1e1e', background: '#0a0a0a' }}>
            <span className="flex items-center gap-1.5" style={{ color: '#888' }}>
              <span style={{ color: '#c8a550' }}>📍</span> {companyAddress}
            </span>
            {s.company_phone && (
              <span className="flex items-center gap-1.5" style={{ color: '#888' }}>
                <span style={{ color: '#c8a550' }}>📞</span> {s.company_phone}
              </span>
            )}
            {s.company_email && (
              <span className="flex items-center gap-1.5" style={{ color: '#888' }}>
                <span style={{ color: '#c8a550' }}>✉️</span> {s.company_email}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="px-10 py-8 print:px-8 print:py-6 border border-t-0 border-gray-200 rounded-b-xl">

        {/* Número e data */}
        <div className="mb-6 text-center">
          <p className="text-base font-bold text-gray-900">{ctrNumber ? `NO. ${ctrNumber} - ${dataHoje}` : dataHoje}</p>
        </div>

        {/* Cláusula 1 – Das Partes */}
        <Clausula num={1} titulo="DAS PARTES.">
          <P>Por este Instrumento Particular que Regula a Cessão de Direitos Creditórios Sem Coobrigação para o <Bold>{companyName}</Bold>, {companyAddress ? `com sede e foro em ${companyAddress}` : ''}{companyDoc ? `, inscrita no CNPJ/MF sob o número ${companyDoc}` : ''}, neste ato representada por seu representante legal - que fazem entre si as partes abaixo nomeadas e qualificadas, mediante as cláusulas e condições pactuadas e aceitas a saber:</P>

          <p className="text-sm font-bold text-gray-900 mb-2">A. PARTES</p>

          <P>
            <Bold>A – CEDENTE:</Bold> {devedor_nome || '_______________'}{cedenteEnd ? `, com sede na ${cedenteEnd}` : ''}, inscrito no CNPJ/CPF sob o n.º {devedor_doc || '_______________'}{cedentePhone ? ` Telefone ${cedentePhone}` : ''}.
          </P>

          {representantes.length > 0 && representantes.map((rep, i) => (
            <P key={i}>
              <Bold>A.{i + 1}. - REPRESENTANTE{representantes.length > 1 ? `(${i + 1})` : '(S)'} DA CEDENTE:</Bold> A CEDENTE é representada por <Bold>{rep.nome}</Bold>{rep.estado_civil ? `, ${rep.estado_civil}` : ''}{rep.rg ? `, portador da identidade ${rep.rg}` : ''}{rep.cpf ? ` e inscrito no CPF/MF ${rep.cpf}` : ''}{rep.endereco ? `, residente e domiciliado em ${rep.endereco}` : ''}{rep.cidade ? `, ${rep.cidade}` : ''}{rep.telefone ? `. Telefone: ${rep.telefone}` : ''}{rep.email ? ` E-mail: ${rep.email}` : ''}.
            </P>
          ))}

          <P>
            <Bold>B. – COMPROMISSÁRIA CESSIONÁRIA:</Bold> {companyName}{companyAddress ? `, ${companyAddress}` : ''}{companyDoc ? `, inscrita no CNPJ/MF sob o número ${companyDoc}` : ''}.
          </P>
          {companyRepresentante && (
            <P><Bold>B.1. – REPRESENTANTE DA CESSIONÁRIA:</Bold> {companyRepresentante}.</P>
          )}
        </Clausula>

        {/* Cláusula 2 – Definições */}
        <Clausula num={2} titulo="DEFINIÇÕES.">
          <P>As partes de comum acordo adotam as seguintes definições com a finalidade de facilitar a interpretação das cláusulas do presente CONTRATO:</P>
          <div className="space-y-2">
            {[
              ['BANCO COBRADOR', `é a instituição bancária responsável pela cobrança regular dos direitos creditórios cedidos a ${companyName}.`],
              ['CEDENTE', 'é a pessoa física ou jurídica que origina direitos creditórios nos termos do presente contrato e cede tais direitos para o CESSIONÁRIO.'],
              ['CESSÃO DE DIREITOS CREDITÓRIOS ou CESSÃO DE DIREITOS DE CRÉDITO', 'A transferência pela CEDENTE, credora originária, de seus direitos creditórios para o CESSIONÁRIO, mantendo-se inalterados os restantes elementos da relação obrigacional.'],
              ['CESSIONÁRIO', 'é o adquirente dos direitos creditórios.'],
              ['CRÉDITOS PERFORMADOS', 'são aqueles créditos resultantes de contratos em que a CEDENTE já cumpriu as suas obrigações (serviços já prestados ou mercadorias já entregues ou operações de crédito já consumadas), restando apenas a obrigação do DEVEDOR de efetuar o pagamento.'],
              ['CRÉDITOS NÃO PERFORMADOS', 'são aqueles créditos cuja existência e validade dependam de entrega de produtos ou prestação futura de serviços, de relação já constituída pela Cedente, consubstanciada em contrato, acordo de fornecimento ou pedido para o fornecimento de produto ou prestação de serviços.'],
              ['DEVEDOR ou SACADO', `é a pessoa física ou jurídica cliente da CEDENTE, responsável pelo pagamento do direito creditório cedido ao SECURITIZADORA.`],
              ['Direitos Creditórios, Direitos de Crédito ou Créditos', 'Títulos de crédito de emissão ou saque da CEDENTE e/ou quaisquer créditos de titularidade da Cedente Performados ou Não Performados.'],
              ['Termo de Cessão - Aditivo – Borderô', `É o documento utilizado para formalizar e efetivar as operações de Cessão de Crédito realizadas com o amparo do presente Contrato entre a CEDENTE e a SECURITIZADORA, o qual aderirá ao presente para todos os fins e efeitos de direito.`],
              ['Vício do Direito Creditório', 'Qualquer defeito do direito creditório ou do título que o representa, que justifique a recusa do DEVEDOR em pagá-lo, no todo ou em parte.'],
            ].map(([term, def]) => (
              <P key={term} className="mb-2"><Bold>{term}</Bold> – {def}</P>
            ))}
          </div>
        </Clausula>

        {/* Cláusula 3 – Objeto */}
        <Clausula num={3} titulo="OBJETO.">
          <P>3.1. Este contrato regerá todas e quaisquer cessões de direitos creditórios que forem feitas pela CEDENTE ao CESSIONÁRIO.</P>
          <P>3.1.1. A CEDENTE é legítima e exclusiva titular de créditos oriundos de cheques e/ou duplicatas decorrentes de suas vendas mercantis ou serviços prestados, a prazo, ou de outros créditos que ceder a SECURITIZADORA. Sobre esses créditos fica estabelecido como limite contratual o valor de <Bold>{creditLimitFmt}</Bold>, para realização de operações de cessão de crédito e que serão formalizadas com a apresentação dos títulos acompanhados de Termo de Cessão – Aditivo - Borderô assinado pela CEDENTE.</P>
          <P>3.1.2. – O limite estabelecido nesse contrato será ajustado em razão das cessões e suas respectivas amortizações. Também poderá sofrer ajuste, sem prévio aviso, mediante alterações creditícias da CEDENTE.</P>
          <P>3.1.3. – Em hipótese alguma admitir-se-á qualquer cessão de direitos creditórios realizada fora da égide ou que contrarie as cláusulas e termos deste contrato.</P>
          <P>3.2. A aceitação dos Direitos Creditórios oferecidos pela CEDENTE é ato discricionário do CESSIONÁRIO e que para realização dependerá das PARTES chegarem a um consenso quanto às condições a serem firmadas no Termo de Cessão – Aditivo – Borderô.</P>
          <P>3.2.1. As Cessões de Créditos entre CEDENTE e CESSIONÁRIO serão realizadas a título oneroso, sendo que os respectivos preços de aquisição serão acordados entre as PARTES, livremente pactuados e fixados, em cada caso, nos Termos de Cessão - Aditivos a serem formalizados.</P>
          <P>3.3. Para que a cessão possa ser formalizada, a documentação que evidencie o lastro dos direitos creditórios será analisada e os recebíveis serão validados em relação aos critérios de elegibilidade estabelecidos no regulamento do CESSIONÁRIO.</P>
          <P>3.4. – Este contrato não poderá ser interpretado como compromisso ou promessa do CESSIONÁRIO e/ou da CEDENTE de, respectivamente, adquirir e/ou de ceder créditos.</P>
          <P>3.5. – Por meio da assinatura, que poderá ser feita por meio eletrônico (assinatura digital) do TERMO DE CESSÃO - ADITIVO, a CEDENTE cede e transfere ao CESSIONÁRIO, em caráter irrevogável e irretratável, todos os direitos creditórios discriminados no respectivo TERMO.</P>
          <P>3.6. – A cessão dos créditos discriminados em cada TERMO DE CESSÃO – ADITIVO somente terá eficácia e validade após o pagamento pelo CESSIONÁRIO à CEDENTE do respectivo preço pela cessão.</P>
          <P>3.7. – O CESSIONÁRIO poderá ceder no todo ou em parte os créditos ora adquiridos e respectivas garantias, sendo dispensável, para tanto, a anuência da CEDENTE.</P>
          <P>3.8. – Além dos créditos performados, o CESSIONÁRIO também poderá adquirir contratos mercantis de compra e venda de produtos, mercadorias e/ou serviços para entrega ou prestação futura.</P>
        </Clausula>

        {/* Cláusula 4 – Critérios de Análise */}
        <Clausula num={4} titulo="CRITÉRIOS DE ANÁLISE E SELEÇÃO DOS DIREITOS CREDITÓRIOS.">
          <P>4.1. – O CESSIONÁRIO somente adquirirá direitos creditórios que tenham sido analisados e selecionados pela SECURITIZADORA.</P>
          <P>4.2. As duplicatas deverão ter sido emitidas pela CEDENTE com base em uma fatura de prestação de serviços já realizados ou de mercadorias já entregues.</P>
          <P>4.3. Todas as duplicatas ou outros títulos de crédito ou contratos deverão estar acompanhados de cópias das notas fiscais/faturas que deram origem aos créditos.</P>
          <P>4.4. – No que tange aos títulos de crédito, com cláusula à ordem, cuja forma de transmissão dar-se-á, por força da Lei, obrigatoriamente por meio do ENDOSSO, o presente contrato representa a causa subjacente do ato formal do endosso.</P>
          <P>4.5. – Em relação aos CRÉDITOS NÃO PERFORMADOS, admitir-se-ão quaisquer documentos que provem a existência do compromisso de entrega ou da prestação de serviços futuros.</P>
        </Clausula>

        {/* Cláusula 5 – Declarações, Obrigações e Responsabilidades das Partes */}
        <Clausula num={5} titulo="DECLARAÇÕES, OBRIGAÇÕES E RESPONSABILIDADES DAS PARTES.">
          <P>5.1. – Antes do respectivo TERMO DE CESSÃO - ADITIVO, a CEDENTE deverá encaminhar imediatamente os títulos de crédito ou contratos e todos os demais documentos físicos que dão lastro aos créditos para a SECURITIZADORA.</P>
          <P>5.2. – A CEDENTE obriga-se a fornecer todas as informações e a apresentar todos os documentos relacionados à cessão de direitos creditórios para o CESSIONÁRIO que lhe forem solicitados.</P>
          <P>5.3. – As partes acordam que a cessão de qualquer crédito pela CEDENTE não acarretará qualquer responsabilidade ou obrigação do CESSIONÁRIO para com o DEVEDOR dos CRÉDITOS ou para com terceiros.</P>
        </Clausula>

        {/* Cláusula 6 – Responsabilidades e Obrigações da Cedente */}
        <Clausula num={6} titulo="RESPONSABILIDADES E OBRIGAÇÕES DA CEDENTE.">
          <P>6.1. A CEDENTE declara, respondendo civil e criminalmente pela veracidade dessas declarações, em relação a quaisquer cessões de crédito que sejam feitas, que:</P>
          <P>6.1.1. – Os direitos creditórios que serão cedidos estarão livres e desembaraçados de quaisquer ônus, gravames e/ou compromissos de qualquer natureza.</P>
          <P>6.1.2. – Está ciente de que, em decorrência de qualquer cessão de crédito, não poderá receber qualquer valor relacionado com os direitos creditórios cedidos.</P>
          <P>6.1.3. – As cessões de crédito que realizará não dependem da anuência ou aprovação do respectivo DEVEDOR ou de qualquer terceiro.</P>
          <P>6.1.4. – A CEDENTE responsabiliza-se pela existência dos créditos representados pelos títulos negociados, por seus vícios redibitórios e pelo cumprimento das obrigações.</P>
          <P>6.1.5. – A CEDENTE, neste ato, assume, sob as penas da lei, a qualidade de fiel depositária, na pessoa de seu(s) representante(s) legal(is).</P>
          <P>6.1.6. É responsável perante o CESSIONÁRIO pelos riscos e prejuízos dos créditos negociados no caso de serem opostas exceções quanto à sua legitimidade, legalidade e veracidade.</P>
          <P>6.1.7. É responsável pela evicção dos direitos creditórios cedidos.</P>
          <P>6.1.8. É responsável civil e criminalmente pela legalidade, veracidade e legitimidade das duplicatas oriundas de suas operações mercantis.</P>
          <P>6.1.9. É responsável civil e criminalmente pelos cheques relativos aos direitos creditórios cedidos decorrentes de vendas a prazo ou prestação de serviços.</P>
          <P>6.2. – O CESSIONÁRIO está autorizado a consultar qualquer sistema de risco de crédito existente para obter informações a respeito da CEDENTE ou dos DEVEDORES.</P>
          <P>6.3. – No caso do não pagamento dos direitos creditórios nas datas dos seus respectivos vencimentos pelos DEVEDORES, o CESSIONÁRIO poderá comunicar o fato a qualquer serviço de proteção ao crédito.</P>
          <P>6.4. Caso deixe de cumprir qualquer obrigação assumida pela CEDENTE neste instrumento, o CESSIONÁRIO poderá comunicar o fato a qualquer serviço de proteção ao crédito.</P>
          <P>6.5. – A CEDENTE autoriza o CESSIONÁRIO a levar os cheques e as duplicatas ou outros títulos de crédito a protesto ou executá-los judicialmente caso os pagamentos não sejam feitos nas datas dos vencimentos.</P>
          <P>6.6. – A CEDENTE declara que possui os originais ou cópias de todos os documentos comprobatórios da venda das mercadorias ou dos serviços.</P>
          <P>6.7. – A CEDENTE autoriza o CESSIONÁRIO a ceder, quando quiser e a quem bem entender, os direitos creditórios que lhe foram cedidos.</P>
          <P>6.8. – A CEDENTE declara que todas as operações que deram origem aos direitos creditórios encontram-se registradas em sua contabilidade.</P>
          <P>6.9. – A CEDENTE declara que nenhuma das cessões de crédito ou operações realizadas com os seus clientes foi feita em fraude à execução ou fraude a credores ou sonegação fiscal.</P>
          <P>6.10. A CEDENTE obriga-se a:</P>
          <P>6.10.1. Não modificar com o DEVEDOR as condições originais da venda do produto/mercadoria ou serviço após a cessão dos direitos creditórios sem o consentimento do CESSIONÁRIO.</P>
          <P>6.10.2. Não alterar a data do vencimento do título cedido; não deduzir, compensar, negociar, extinguir ou modificar qualquer característica dos créditos cedidos.</P>
          <P>6.10.3. Informar ao CESSIONÁRIO, no prazo máximo de 24 horas, sobre qualquer reclamação, modificação, cancelamento, arrependimento do DEVEDOR.</P>
          <P>6.10.4. Informar o CESSIONÁRIO, no prazo máximo de 24 horas, sobre qualquer ação judicial, protesto, notificação ou medida extrajudicial.</P>
          <P>6.10.5. Não omitir nenhuma informação que poderia impedir, alterar, desaconselhar ou colocar em risco a cessão dos direitos creditórios.</P>
          <P>6.10.6. Fornecer, em 48 horas no máximo, cópias ou os originais de toda a documentação comprobatória.</P>
          <P>6.10.7. Realizar todos os procedimentos previstos nas cláusulas relativos à oferta dos direitos creditórios.</P>
          <P>6.10.8. Notificar os DEVEDORES da cessão de crédito realizada, nos termos do artigo 290 do Código Civil.</P>
          <P>6.10.9. Repassar ao CESSIONÁRIO o crédito recebido diretamente do DEVEDOR, no prazo máximo de 48 horas.</P>
          <P>6.10.10. Reembolsar todos os gastos e despesas legais, inclusive honorários advocatícios e custas processuais.</P>
          <P>6.10.11. Indenizar o CESSIONÁRIO de quaisquer prejuízos causados pela CEDENTE.</P>
          <P>6.10.12. Comunicar ao CESSIONÁRIO, no prazo máximo de 5 dias, qualquer alteração do seu contrato social ou mudança de endereço.</P>
          <P>6.10.13. Comunicar ao CESSIONÁRIO, no prazo máximo de 5 dias, qualquer processo de reorganização societária.</P>
          <P>6.11. – A CEDENTE assume a qualidade de fiel depositária provisória de todos os documentos que dão lastro aos créditos.</P>
          <P>6.12. – A cada cessão de crédito realizada, a CEDENTE deverá praticar todos os atos necessários para se proceder à tradição dos títulos de crédito ao CESSIONÁRIO.</P>
          <P>6.13. Se não ocorrer a tradição dos títulos, a CEDENTE ficará nomeada fiel depositária dos mencionados documentos.</P>
        </Clausula>

        <Clausula num={7} titulo="VÍCIOS DOS DIREITOS CREDITÓRIOS.">
          <P>7.1. No caso de serem opostas quaisquer oposições ou exceções aos direitos ou títulos de crédito cedidos, a CEDENTE assumirá integral responsabilidade por quaisquer vícios verificados.</P>
        </Clausula>

        <Clausula num={8} titulo="FORMALIZAÇÃO DAS CESSÕES DOS DIREITOS CREDITÓRIOS.">
          <P>8.1. – Cada aquisição de direitos creditórios será formalizada e demonstrada por meio de um instrumento denominado "TERMO DE CESSÃO - ADITIVO".</P>
          <P>8.1.1. – O TERMO DE CESSÃO – ADITIVO poderá ser firmado por escrito ou, preferencialmente, em forma eletrônica com a utilização de processo de certificação disponibilizado pela infraestrutura brasileira de chaves públicas - ICP-Brasil.</P>
          <P>8.2. – Os cheques e as duplicatas serão entregues pela CEDENTE ao CESSIONÁRIO.</P>
        </Clausula>

        <Clausula num={9} titulo="PREÇO E PAGAMENTO.">
          <P>9.1. – O preço de aquisição dos direitos creditórios será fixado pela SECURITIZADORA, levando em consideração as condições de mercado e as características dos créditos.</P>
          <P>9.2. – A conta corrente da CEDENTE para recebimento dos valores será informada oportunamente.</P>
        </Clausula>

        <Clausula num={10} titulo="COBRANÇA.">
          <P>10.1. – A cobrança dos direitos creditórios cedidos será realizada pelo CESSIONÁRIO ou por instituição por ele contratada.</P>
          <P>10.2. – O recebimento dos direitos creditórios será realizado direto e exclusivamente em conta corrente do CESSIONÁRIO junto ao BANCO COBRADOR.</P>
          <P>10.3. – Consideram-se, para todos os efeitos legais, liquidados os direitos creditórios no momento em que o DEVEDOR ou terceiro efetuar o seu respectivo pagamento.</P>
        </Clausula>

        <Clausula num={11} titulo="CONFIDENCIALIDADE.">
          <P>11.1. – As cláusulas deste contrato são estritamente confidenciais. Nenhuma das partes pode prestar informações a terceiros do seu conteúdo ou das transações com base nele realizadas sem o prévio consentimento por escrito da outra parte.</P>
        </Clausula>

        <Clausula num={12} titulo="NATUREZA EXECUTIVA DESTE CONTRATO.">
          <P>12.1. – A este contrato, assinado pelas partes e por duas testemunhas, e aos TERMOS DE CESSÃO – ADITIVO dele decorrentes, atribui-se a condição de título executivo extrajudicial nos termos do artigo 784, inciso III, do Código de Processo Civil.</P>
        </Clausula>

        <Clausula num={13} titulo="SITUAÇÃO DAS CESSÕES DE CRÉDITO EFETUADAS NO CASO DE FALÊNCIA DA CEDENTE.">
          <P>13.1. – Em caso de falência da CEDENTE, nos termos do artigo 136, parágrafo primeiro, da lei nº 11.101, de 9 de fevereiro de 2005, não será declarada a ineficácia ou revogado o ato de cessão em prejuízo dos portadores dos valores mobiliários emitidos pelo CESSIONÁRIO.</P>
        </Clausula>

        <Clausula num={14} titulo="COMUNICAÇÕES.">
          <P>14.1. – A CEDENTE e o CESSIONÁRIO estabelecem como válidos para efeito de mútua comunicação, o fax, correio eletrônico/e-mail ou a carta com AR (aviso de recebimento).</P>
        </Clausula>

        <Clausula num={15} titulo="LIBERALIDADE.">
          <P>15.1. – O não exercício, por qualquer das partes, de direitos relativos ao presente contrato será considerado como mera liberalidade e tolerância.</P>
        </Clausula>

        <Clausula num={16} titulo="INTEGRIDADE DO CONTRATO.">
          <P>16.1. – Este contrato constitui o entendimento integral entre as partes contratantes e revoga expressamente todas e quaisquer tratativas ou discussões entre elas em relação ao objeto deste instrumento.</P>
        </Clausula>

        <Clausula num={17} titulo="ALTERAÇÕES.">
          <P>17.1. – Nenhuma alteração ao presente contrato será considerada válida a menos que acordada expressamente por meio de aditamento contratual assinado pelas partes.</P>
          <P>17.2. – A renúncia, escrita ou verbal, por qualquer das partes, de qualquer direito oriundo deste contrato dada em uma ocasião, não as obrigará em qualquer ocasião subsequente.</P>
        </Clausula>

        <Clausula num={18} titulo="INDEPENDÊNCIA DAS DISPOSIÇÕES.">
          <P>18.1. – Se qualquer condição deste contrato for considerada nula, inexequível ou sem efeito, no todo ou em parte, as demais condições deverão permanecer válidas.</P>
        </Clausula>

        <Clausula num={19} titulo="VIGÊNCIA.">
          <P>19.1. – O presente contrato vigorará por prazo indeterminado ou durante o prazo de duração porventura estabelecido no Regulamento do CESSIONÁRIO.</P>
        </Clausula>

        <Clausula num={20} titulo="EXTINÇÃO DO CONTRATO.">
          <P>20.1. – Este contrato será rescindido de pleno direito, independentemente de aviso ou notificação e sem prejuízo das penalidades aplicáveis, se a CEDENTE deixar de cumprir qualquer obrigação assumida neste contrato.</P>
          <P>20.2. – Este contrato poderá ser denunciado, pela CEDENTE ou pelo CESSIONÁRIO, a qualquer tempo, sem ônus algum.</P>
          <P>20.3. – A rescisão, independente do motivo, não causará modificação dos direitos e das obrigações das PARTES em relação às Cessões efetuadas.</P>
        </Clausula>

        <Clausula num={21} titulo="DISPOSIÇÕES GERAIS.">
          <P>21.1. – Para efeitos do disposto neste Instrumento, sempre que um prazo se encerra em dia não útil, o vencimento da obrigação será no dia útil seguinte.</P>
          <P>21.2. – Todos os tributos incidentes ou que venham a incidir sobre a presente operação, serão de responsabilidade exclusiva da parte que legalmente for considerada contribuinte.</P>
        </Clausula>

        <Clausula num={22} titulo="OMISSÕES.">
          <P>22.1. – Os casos omissos resolver-se-ão pela legislação financeira, comercial e civil em vigor e pelos princípios gerais do direito do comércio.</P>
        </Clausula>

        <Clausula num={23} titulo="FORO DE ELEIÇÃO.">
          <P>23.1. – O presente contrato será regido pelas leis da República Federativa do Brasil. Fica eleito o Foro Central da Comarca de <Bold>{foro || '_______________'}</Bold>, como único competente para dirimir quaisquer dúvidas e disputas decorrentes do presente contrato. E assim, por estarem justas e contratadas, as partes assinam este contrato em 3 (três) vias de igual teor e efeito na presença de duas testemunhas.</P>
        </Clausula>

        {/* Assinaturas */}
        <div className="mt-8 pt-6 border-t border-gray-300">
          <p className="text-sm text-right text-gray-700 mb-10">
            {foro || '_______________'}, {dataHoje}
          </p>

          <div className="grid grid-cols-2 gap-12 mt-10">
            {/* Cedente */}
            <div className="text-center">
              <div className="border-t-2 border-gray-800 pt-2 mt-16">
                <p className="text-sm font-bold">{devedor_nome || '_______________'}</p>
                <p className="text-xs font-bold text-gray-700 mt-0.5">CEDENTE:</p>
                <p className="text-xs text-gray-500">CNPJ: {devedor_doc || '_______________'}</p>
              </div>
            </div>
            {/* Cessionário */}
            <div className="text-center">
              <div className="border-t-2 border-gray-800 pt-2 mt-16">
                <p className="text-sm font-bold">{companyName}</p>
                <p className="text-xs font-bold text-gray-700 mt-0.5">CESSIONÁRIO:</p>
                <p className="text-xs text-gray-500">CNPJ: {companyDoc}</p>
              </div>
            </div>
          </div>

          {/* Responsáveis Solidários (avalistas/representantes com poder de assinar) */}
          {avalistas.length > 0 && (
            <>
              <p className="text-xs font-bold text-center text-gray-600 mt-10 uppercase tracking-widest">RESPONSÁVEL(EIS) SOLIDÁRIO(S):</p>
              <div className="grid grid-cols-2 gap-12 mt-6">
                {avalistas.map((av, i) => (
                  <div key={i} className="text-center">
                    <div className="border-t-2 border-gray-800 pt-2 mt-16">
                      <p className="text-sm font-bold">{av.nome}</p>
                      <p className="text-xs text-gray-500">CPF: {av.cpf}</p>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Rodapé */}
        <div className="mt-8 pt-4 border-t border-gray-200 flex items-center justify-between gap-4 flex-wrap">
          <div className="text-xs text-gray-400">
            <div>{companyName}{companyDoc ? ` — CNPJ ${companyDoc}` : ''}</div>
            <div>Documento gerado em {dataHoje}</div>
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