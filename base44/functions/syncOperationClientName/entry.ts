import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * Função para sincronizar o client_name nas operações quando o cliente é atualizado
 * Deve ser acionada por uma automação ao atualizar um cliente
 */
Deno.serve(async (req) => {
  try {
    const body = await req.json();
    const base44 = createClientFromRequest(req);

    // Valida autenticação
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { client_id, new_client_name } = body;

    if (!client_id || !new_client_name) {
      return Response.json({ error: 'Missing client_id or new_client_name' }, { status: 400 });
    }

    // Busca todas as operações do cliente
    const operations = await base44.asServiceRole.entities.Operation.filter({ client_id });

    // Atualiza cada operação com o novo nome
    const updates = operations.map(op => 
      base44.asServiceRole.entities.Operation.update(op.id, { client_name: new_client_name })
    );

    await Promise.all(updates);

    return Response.json({ 
      success: true, 
      updated_count: operations.length 
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});