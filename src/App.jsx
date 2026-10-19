import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Outlet } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import AppLayout from '@/components/layout/AppLayout';

// Pages
import Dashboard from '@/pages/Dashboard.jsx';
import Clientes from '@/pages/Clientes.jsx';
import ClienteForm from '@/pages/ClienteForm';
import ClienteDetail from '@/pages/ClienteDetail.jsx';
import Operacoes from '@/pages/Operacoes.jsx';
import OperacaoForm from '@/pages/OperacaoForm';
import OperacaoDetail from '@/pages/OperacaoDetail.jsx';
import Cheques from '@/pages/Cheques';
import Pagamentos from '@/pages/Pagamentos.jsx';
import FluxoCaixa from '@/pages/FluxoCaixa.jsx';
import Cobranca from '@/pages/Cobranca';
import Simulador from '@/pages/Simulador';
import Documentos from '@/pages/Documentos';
import Agenda from '@/pages/Agenda';
import Auditoria from '@/pages/Auditoria';
import Configuracoes from '@/pages/Configuracoes';
import GerenciarUsuarios from '@/pages/GerenciarUsuarios';
import Leads from '@/pages/Leads';
import Sacados from '@/pages/Sacados';
import SacadoForm from '@/pages/SacadoForm';
import SacadoDetail from '@/pages/SacadoDetail';
import Bancos from '@/pages/Bancos.jsx';
import Assessores from '@/pages/Assessores';
import ContratoGerador from '@/pages/ContratoGerador';
import AcessoNegado from '@/pages/AcessoNegado';
import RouteGuard from '@/components/layout/RouteGuard';
import ValidarDocumento from '@/pages/ValidarDocumento';
import NotificacaoAceitePublica from '@/pages/NotificacaoAceitePublica';
import Assinaturas from '@/pages/Assinaturas';
import AssinaturaDocumentoForm from '@/pages/AssinaturaDocumentoForm';
import AssinaturaPublica from '@/pages/AssinaturaPublica';
import ValidarAssinatura from '@/pages/ValidarAssinatura';
import Produtos from '@/pages/Produtos';
import Boletos from '@/pages/Boletos';
import OnboardingPublico from '@/pages/OnboardingPublico';
import OnboardingLinks from '@/pages/OnboardingLinks';
import GestaoVisaoGeral from '@/pages/gestao/VisaoGeral';
import GestaoLancamentos from '@/pages/gestao/Lancamentos';
import GestaoContasPagar from '@/pages/gestao/ContasPagar';
import GestaoPatrimonio from '@/pages/gestao/Patrimonio';
import GestaoCategorias from '@/pages/gestao/Categorias';
import GestaoContas from '@/pages/gestao/Contas';

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="flex flex-col items-center">
            <div className="text-2xl font-bold tracking-tight">
              <span className="text-foreground">PS</span>
              <span className="gold-text">X</span>
            </div>
            <div className="text-xs font-medium text-foreground/60 tracking-widest uppercase">Capital</div>
          </div>
          <div className="w-6 h-6 border-2 border-border border-t-foreground rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      navigateToLogin();
      return null;
    }
  }

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route element={<RouteGuard />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/clientes" element={<Clientes />} />
          <Route path="/clientes/novo" element={<ClienteForm />} />
          <Route path="/clientes/:id" element={<ClienteDetail />} />
          <Route path="/clientes/:id/editar" element={<ClienteForm />} />
          <Route path="/sacados" element={<Sacados />} />
          <Route path="/sacados/novo" element={<SacadoForm />} />
          <Route path="/sacados/:id" element={<SacadoDetail />} />
          <Route path="/sacados/:id/editar" element={<SacadoForm />} />
          <Route path="/operacoes" element={<Operacoes />} />
          <Route path="/operacoes/nova" element={<OperacaoForm />} />
          <Route path="/operacoes/:id/editar" element={<OperacaoForm />} />
          <Route path="/operacoes/:id" element={<OperacaoDetail />} />
          <Route path="/cheques" element={<Cheques />} />
          <Route path="/cheques/novo" element={<Cheques />} />
          <Route path="/pagamentos" element={<Pagamentos />} />
          <Route path="/cobranca" element={<Cobranca />} />
          <Route path="/caixa" element={<FluxoCaixa />} />
          <Route path="/simulador" element={<Simulador />} />
          <Route path="/documentos" element={<Documentos />} />
          <Route path="/contratos" element={<ContratoGerador />} />
          <Route path="/agenda" element={<Agenda />} />
          <Route path="/auditoria" element={<Auditoria />} />
          <Route path="/bancos" element={<Bancos />} />
          <Route path="/assessores" element={<Assessores />} />
          <Route path="/configuracoes" element={<Configuracoes />} />
          <Route path="/usuarios" element={<GerenciarUsuarios />} />
          <Route path="/leads" element={<Leads />} />
          <Route path="/assinaturas" element={<Assinaturas />} />
          <Route path="/assinaturas/novo" element={<AssinaturaDocumentoForm />} />
          <Route path="/assinaturas/:id" element={<AssinaturaDocumentoForm />} />
          <Route path="/produtos" element={<Produtos />} />
          <Route path="/boletos" element={<Boletos />} />
          <Route path="/onboarding-links" element={<OnboardingLinks />} />
          <Route path="/gestao" element={<GestaoVisaoGeral />} />
          <Route path="/gestao/lancamentos" element={<GestaoLancamentos />} />
          <Route path="/gestao/contas-a-pagar" element={<GestaoContasPagar />} />
          <Route path="/gestao/patrimonio" element={<GestaoPatrimonio />} />
          <Route path="/gestao/categorias" element={<GestaoCategorias />} />
          <Route path="/gestao/contas" element={<GestaoContas />} />
        </Route>
        <Route path="/acesso-negado" element={<AcessoNegado />} />
      </Route>
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <Routes>
            <Route path="/validar" element={<ValidarDocumento />} />
            <Route path="/notificacao/aceite" element={<NotificacaoAceitePublica />} />
            <Route path="/assinar/:uuid" element={<AssinaturaPublica />} />
            <Route path="/validar-assinatura" element={<ValidarAssinatura />} />
            <Route path="/onboarding/:token" element={<OnboardingPublico />} />
            <Route path="*" element={<AuthenticatedApp />} />
          </Routes>
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  );
}

export default App;