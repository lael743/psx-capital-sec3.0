import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json();

    const simulation = await base44.asServiceRole.entities.Simulacao.create({
      name: payload.name || '',
      email: payload.email || '',
      phone: payload.phone || '',
      document: payload.document || '',
      document_type: payload.document_type || 'CPF',
      amount: payload.amount || 0,
      term_days: payload.term_days || 0,
      operation_type: payload.operation_type || 'emprestimo',
      source: 'site',
      status: 'pendente',
      notes: payload.notes || '',
    });

    return Response.json({ success: true, id: simulation.id });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});