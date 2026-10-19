import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await req.json();
    const { document } = payload;

    if (!document) {
      return Response.json({ error: 'Documento (CPF/CNPJ) não informado' }, { status: 400 });
    }

    // Busca cliente pelo documento
    const clients = await base44.asServiceRole.entities.Client.filter({ document: document });
    if (!clients || clients.length === 0) {
      return Response.json({ error: 'Cliente não encontrado' }, { status: 404 });
    }

    const client = clients[0];

    // Busca operações do cliente
    const operations = await base44.asServiceRole.entities.Operation.filter(
      { client_id: client.id },
      '-due_date',
      50
    );

    // Busca pagamentos do cliente
    const payments = await base44.asServiceRole.entities.Payment.filter(
      { client_id: client.id },
      '-payment_date',
      50
    );

    // Calcula totais
    const totalBorrowed = operations.reduce((sum, op) => sum + (op.gross_value || 0), 0);
    const totalPaid = operations.reduce((sum, op) => sum + (op.amount_paid || 0), 0);
    const balanceDue = operations.reduce((sum, op) => sum + ((op.total_receivable || 0) - (op.amount_paid || 0)), 0);
    const activeOperations = operations.filter(op => op.status !== 'quitado');
    const overdueOperations = operations.filter(op => op.status === 'atrasado' || op.status === 'inadimplente');

    return Response.json({
      client: {
        id: client.id,
        name: client.name,
        document: client.document,
        document_type: client.document_type,
        email: client.email,
        phone: client.phone,
        city: client.city,
        state: client.state,
        credit_limit: client.credit_limit,
        risk_profile: client.risk_profile,
        status: client.status,
      },
      summary: {
        total_borrowed: totalBorrowed,
        total_paid: totalPaid,
        balance_due: balanceDue,
        active_operations: activeOperations.length,
        overdue_operations: overdueOperations.length,
      },
      operations: operations.map(op => ({
        id: op.id,
        type: op.type,
        gross_value: op.gross_value,
        total_receivable: op.total_receivable,
        amount_paid: op.amount_paid,
        balance_due: (op.total_receivable || 0) - (op.amount_paid || 0),
        status: op.status,
        start_date: op.start_date,
        due_date: op.due_date,
        days: op.days,
        rate: op.rate,
        sacado_name: op.sacado_name,
        notificacao_status: op.notificacao_status,
        contract_signed_confirmed: op.contract_signed_confirmed,
      })),
      payments: payments.map(p => ({
        id: p.id,
        operation_id: p.operation_id,
        amount: p.amount,
        payment_date: p.payment_date,
        method: p.method,
        notes: p.notes,
      })),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});