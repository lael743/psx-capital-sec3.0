import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') {
      return Response.json({ error: 'Method not allowed' }, { status: 405 });
    }

    const base44 = createClientFromRequest(req);

    // Busca o maior ID usado para sequenciar
    const allDocs = await base44.asServiceRole.entities.DocumentoValidacao.list();
    
    // Extrai números sequenciais do formato YYYYMMDD-XXXX
    let maxSequence = 0;
    const hoje = new Date().toISOString().split('T')[0].replace(/-/g, '');
    
    allDocs.forEach(doc => {
      if (doc.num_promissoria && doc.num_promissoria.startsWith(hoje)) {
        const parts = doc.num_promissoria.split('-');
        if (parts.length === 2) {
          const seq = parseInt(parts[1], 10);
          if (seq > maxSequence) maxSequence = seq;
        }
      }
    });

    const nextSequence = (maxSequence + 1).toString().padStart(4, '0');
    const numPromissoria = `${hoje}-${nextSequence}`;

    return Response.json({ num_promissoria: numPromissoria });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});