// Registro de acesso a documento de cliente.
//
// Chamado pelas Edge Functions que LEEM arquivo de cliente. É o servidor que lê
// os documentos, então registrar aqui não depende do navegador e não pode ser
// contornado pela aplicação.
//
// TRÊS REGRAS, e as três importam mais que a funcionalidade:
//
// 1. NUNCA DERRUBA A OPERAÇÃO. Falha de auditoria não pode impedir o advogado de
//    ler o próprio documento. Tudo dentro de try/catch, e o erro vai para o
//    console, não para a resposta.
//
// 2. NUNCA GRAVA O CONTEÚDO. Registra caminho, nome, tamanho e quem pediu —
//    nunca o texto. Registro de auditoria que copia o documento vira segunda
//    cópia do dado sigiloso, e aí o remédio é pior que a doença.
//
// 3. GRAVA COM service_role, e a tabela não tem política de inserção para
//    `authenticated`. Assim o registro não pode ser forjado nem suprimido a
//    partir do navegador.

export type AcaoAcesso = 'extracao' | 'analise' | 'digest' | 'leitura'

export async function registraAcesso(
  admin: any,
  dados: {
    filePath: string
    acao: AcaoAcesso
    origem: string
    userId?: string | null
    bytes?: number | null
    fileName?: string | null
    detalhe?: string | null
  },
): Promise<void> {
  try {
    if (!admin || !dados?.filePath) return

    // O workspace vem do próprio anexo, não do usuário: se um dia alguém ler
    // arquivo de outro workspace, o registro tem de apontar o workspace DO
    // ARQUIVO — é isso que torna o log útil numa investigação.
    let workspaceId: string | null = null
    let attachmentId: string | null = null
    let fileName: string | null = dados.fileName ?? null
    try {
      const { data } = await admin
        .from('process_attachments')
        .select('id, workspace_id, file_name')
        .eq('file_path', dados.filePath)
        .maybeSingle()
      if (data) {
        attachmentId = data.id ?? null
        workspaceId = data.workspace_id ?? null
        fileName = fileName ?? data.file_name ?? null
      }
    } catch {
      /* anexo órfão, ou tabela indisponível: registra assim mesmo */
    }

    await admin.from('document_access_log').insert({
      workspace_id: workspaceId,
      attachment_id: attachmentId,
      file_path: dados.filePath,
      file_name: fileName,
      user_id: dados.userId ?? null,
      acao: dados.acao,
      origem: dados.origem,
      bytes: dados.bytes ?? null,
      detalhe: dados.detalhe ?? null,
    })
  } catch (e) {
    console.error('[registro-acesso] falhou (a operação segue):', e)
  }
}
