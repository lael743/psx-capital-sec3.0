import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json();

    const lead = await base44.asServiceRole.entities.Lead.create({
      name: payload.name || '',
      email: payload.email || '',
      phone: payload.phone || '',
      document: payload.document || '',
      document_type: payload.document_type || 'CPF',
      interest: payload.interest || '',
      source: 'site',
      status: 'novo',
      notes: payload.notes || '',
    });

    return Response.json({ success: true, id: lead.id });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});