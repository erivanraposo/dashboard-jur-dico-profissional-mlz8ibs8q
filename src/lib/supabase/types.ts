export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      agentes: {
        Row: {
          categoria: string | null
          compatible_minute_types: string[]
          created_at: string
          descricao: string | null
          description: string | null
          effort: string | null
          id: string
          is_active: boolean
          max_tokens: number | null
          model: string
          name: string
          system_prompt: string
          thinking_mode: string | null
          titulo: string | null
          tools: Json | null
          versao: number | null
        }
        Insert: {
          categoria?: string | null
          compatible_minute_types?: string[]
          created_at?: string
          descricao?: string | null
          description?: string | null
          effort?: string | null
          id?: string
          is_active?: boolean
          max_tokens?: number | null
          model: string
          name: string
          system_prompt: string
          thinking_mode?: string | null
          titulo?: string | null
          tools?: Json | null
          versao?: number | null
        }
        Update: {
          categoria?: string | null
          compatible_minute_types?: string[]
          created_at?: string
          descricao?: string | null
          description?: string | null
          effort?: string | null
          id?: string
          is_active?: boolean
          max_tokens?: number | null
          model?: string
          name?: string
          system_prompt?: string
          thinking_mode?: string | null
          titulo?: string | null
          tools?: Json | null
          versao?: number | null
        }
        Relationships: []
      }
      carf_sumulas: {
        Row: {
          aprovada_em: string | null
          colhido_em: string
          enunciado: string | null
          fonte_url: string | null
          id: string
          notas: string[]
          numero: number
          orgao: string | null
          portaria_vinculante: string | null
          precedentes: string | null
          situacao: string
          url_portaria: string | null
          vinculante: boolean
        }
        Insert: {
          aprovada_em?: string | null
          colhido_em?: string
          enunciado?: string | null
          fonte_url?: string | null
          id?: string
          notas?: string[]
          numero: number
          orgao?: string | null
          portaria_vinculante?: string | null
          precedentes?: string | null
          situacao?: string
          url_portaria?: string | null
          vinculante?: boolean
        }
        Update: {
          aprovada_em?: string | null
          colhido_em?: string
          enunciado?: string | null
          fonte_url?: string | null
          id?: string
          notas?: string[]
          numero?: number
          orgao?: string | null
          portaria_vinculante?: string | null
          precedentes?: string | null
          situacao?: string
          url_portaria?: string | null
          vinculante?: boolean
        }
        Relationships: []
      }
      clipped_cases: {
        Row: {
          created_at: string
          id: string
          jurisprudence_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          jurisprudence_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          jurisprudence_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clipped_cases_jurisprudence_id_fkey"
            columns: ["jurisprudence_id"]
            isOneToOne: false
            referencedRelation: "jurisprudence"
            referencedColumns: ["id"]
          },
        ]
      }
      custos: {
        Row: {
          cache_creation_input_tokens: number | null
          cache_read_input_tokens: number | null
          cached_tokens: number
          created_at: string
          currency: string
          estimated_cost: number
          id: string
          invocation_id: string
          workspace_id: string
        }
        Insert: {
          cache_creation_input_tokens?: number | null
          cache_read_input_tokens?: number | null
          cached_tokens?: number
          created_at?: string
          currency?: string
          estimated_cost?: number
          id?: string
          invocation_id: string
          workspace_id: string
        }
        Update: {
          cache_creation_input_tokens?: number | null
          cache_read_input_tokens?: number | null
          cached_tokens?: number
          created_at?: string
          currency?: string
          estimated_cost?: number
          id?: string
          invocation_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "custos_invocation_id_fkey"
            columns: ["invocation_id"]
            isOneToOne: true
            referencedRelation: "invocacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custos_invocation_id_fkey"
            columns: ["invocation_id"]
            isOneToOne: true
            referencedRelation: "vw_recent_invocations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custos_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      document_access_log: {
        Row: {
          acao: string
          attachment_id: string | null
          bytes: number | null
          created_at: string
          detalhe: string | null
          file_name: string | null
          file_path: string
          id: number
          origem: string
          user_id: string | null
          workspace_id: string | null
        }
        Insert: {
          acao: string
          attachment_id?: string | null
          bytes?: number | null
          created_at?: string
          detalhe?: string | null
          file_name?: string | null
          file_path: string
          id?: number
          origem: string
          user_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          acao?: string
          attachment_id?: string | null
          bytes?: number | null
          created_at?: string
          detalhe?: string | null
          file_name?: string | null
          file_path?: string
          id?: number
          origem?: string
          user_id?: string | null
          workspace_id?: string | null
        }
        Relationships: []
      }
      document_digests: {
        Row: {
          attachment_id: string
          chunk_index: number
          created_at: string
          digest_md: string | null
          error_detail: string | null
          estimated_cost: number
          id: string
          input_tokens: number
          model: string | null
          output_tokens: number
          page_end: number | null
          page_start: number | null
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          attachment_id: string
          chunk_index?: number
          created_at?: string
          digest_md?: string | null
          error_detail?: string | null
          estimated_cost?: number
          id?: string
          input_tokens?: number
          model?: string | null
          output_tokens?: number
          page_end?: number | null
          page_start?: number | null
          status?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          attachment_id?: string
          chunk_index?: number
          created_at?: string
          digest_md?: string | null
          error_detail?: string | null
          estimated_cost?: number
          id?: string
          input_tokens?: number
          model?: string | null
          output_tokens?: number
          page_end?: number | null
          page_start?: number | null
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_digests_attachment_id_fkey"
            columns: ["attachment_id"]
            isOneToOne: false
            referencedRelation: "process_attachments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_digests_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      invocacoes: {
        Row: {
          action: string | null
          agent_id: string
          created_at: string
          diagnostic_log: string | null
          id: string
          input_tokens: number
          output_tokens: number
          process_id: string | null
          user_id: string
          workspace_id: string
        }
        Insert: {
          action?: string | null
          agent_id: string
          created_at?: string
          diagnostic_log?: string | null
          id?: string
          input_tokens?: number
          output_tokens?: number
          process_id?: string | null
          user_id: string
          workspace_id: string
        }
        Update: {
          action?: string | null
          agent_id?: string
          created_at?: string
          diagnostic_log?: string | null
          id?: string
          input_tokens?: number
          output_tokens?: number
          process_id?: string | null
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invocacoes_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agentes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invocacoes_process_id_fkey"
            columns: ["process_id"]
            isOneToOne: false
            referencedRelation: "processes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invocacoes_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      jurisprudence: {
        Row: {
          court: string
          created_at: string
          full_text: string | null
          id: string
          link: string | null
          summary: string
          tags: string[] | null
        }
        Insert: {
          court: string
          created_at?: string
          full_text?: string | null
          id?: string
          link?: string | null
          summary: string
          tags?: string[] | null
        }
        Update: {
          court?: string
          created_at?: string
          full_text?: string | null
          id?: string
          link?: string | null
          summary?: string
          tags?: string[] | null
        }
        Relationships: []
      }
      lawyers: {
        Row: {
          created_at: string
          full_name: string
          id: string
          oab_number: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          full_name: string
          id?: string
          oab_number: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          full_name?: string
          id?: string
          oab_number?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lawyers_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      minutes: {
        Row: {
          approval_requested_at: string | null
          approval_requested_by: string | null
          approval_status: string
          approved_at: string | null
          approved_by: string | null
          client_name: string | null
          comarca: string | null
          content: string
          created_at: string
          id: string
          invocation_id: string | null
          lawyer_id: string | null
          minute_type: string | null
          objeto: string | null
          pedido: string | null
          process_id: string | null
          revision_notes: string | null
          status: string
          title: string
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          approval_requested_at?: string | null
          approval_requested_by?: string | null
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          client_name?: string | null
          comarca?: string | null
          content: string
          created_at?: string
          id?: string
          invocation_id?: string | null
          lawyer_id?: string | null
          minute_type?: string | null
          objeto?: string | null
          pedido?: string | null
          process_id?: string | null
          revision_notes?: string | null
          status?: string
          title: string
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          approval_requested_at?: string | null
          approval_requested_by?: string | null
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          client_name?: string | null
          comarca?: string | null
          content?: string
          created_at?: string
          id?: string
          invocation_id?: string | null
          lawyer_id?: string | null
          minute_type?: string | null
          objeto?: string | null
          pedido?: string | null
          process_id?: string | null
          revision_notes?: string | null
          status?: string
          title?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "minutes_approval_requested_by_fkey"
            columns: ["approval_requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "minutes_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "minutes_invocation_id_fkey"
            columns: ["invocation_id"]
            isOneToOne: false
            referencedRelation: "invocacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "minutes_invocation_id_fkey"
            columns: ["invocation_id"]
            isOneToOne: false
            referencedRelation: "vw_recent_invocations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "minutes_lawyer_id_fkey"
            columns: ["lawyer_id"]
            isOneToOne: false
            referencedRelation: "lawyers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "minutes_process_id_fkey"
            columns: ["process_id"]
            isOneToOne: false
            referencedRelation: "processes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "minutes_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      prazos: {
        Row: {
          created_at: string
          descricao: string | null
          due_date: string
          id: string
          lawyer_id: string | null
          process_id: string | null
          status: string
          titulo: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          descricao?: string | null
          due_date: string
          id?: string
          lawyer_id?: string | null
          process_id?: string | null
          status?: string
          titulo: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          descricao?: string | null
          due_date?: string
          id?: string
          lawyer_id?: string | null
          process_id?: string | null
          status?: string
          titulo?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "prazos_lawyer_id_fkey"
            columns: ["lawyer_id"]
            isOneToOne: false
            referencedRelation: "lawyers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prazos_process_id_fkey"
            columns: ["process_id"]
            isOneToOne: false
            referencedRelation: "processes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prazos_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      precedent_verifications: {
        Row: {
          cache_read_tokens: number
          cache_write_tokens: number
          created_at: string
          entrada: string
          estimated_cost: number
          id: string
          input_tokens: number
          modelo: string | null
          n_citacoes: number
          n_confirmado: number
          n_divergente: number
          n_identificado: number
          n_nao_local: number
          n_vigencia_comprometida: number
          output_tokens: number
          resultado: Json
          tese_alegada: string | null
          user_id: string | null
          workspace_id: string
        }
        Insert: {
          cache_read_tokens?: number
          cache_write_tokens?: number
          created_at?: string
          entrada: string
          estimated_cost?: number
          id?: string
          input_tokens?: number
          modelo?: string | null
          n_citacoes?: number
          n_confirmado?: number
          n_divergente?: number
          n_identificado?: number
          n_nao_local?: number
          n_vigencia_comprometida?: number
          output_tokens?: number
          resultado?: Json
          tese_alegada?: string | null
          user_id?: string | null
          workspace_id: string
        }
        Update: {
          cache_read_tokens?: number
          cache_write_tokens?: number
          created_at?: string
          entrada?: string
          estimated_cost?: number
          id?: string
          input_tokens?: number
          modelo?: string | null
          n_citacoes?: number
          n_confirmado?: number
          n_divergente?: number
          n_identificado?: number
          n_nao_local?: number
          n_vigencia_comprometida?: number
          output_tokens?: number
          resultado?: Json
          tese_alegada?: string | null
          user_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "precedent_verifications_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      process_attachments: {
        Row: {
          created_at: string
          digest_status: string | null
          expira_avisado_em: string | null
          file_name: string
          file_path: string
          file_size: number
          file_type: string
          id: string
          process_id: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          digest_status?: string | null
          expira_avisado_em?: string | null
          file_name: string
          file_path: string
          file_size: number
          file_type: string
          id?: string
          process_id?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          digest_status?: string | null
          expira_avisado_em?: string | null
          file_name?: string
          file_path?: string
          file_size?: number
          file_type?: string
          id?: string
          process_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "process_attachments_process_id_fkey"
            columns: ["process_id"]
            isOneToOne: false
            referencedRelation: "processes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "process_attachments_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      processes: {
        Row: {
          area: string
          case_number: string
          client_name: string
          created_at: string
          description: string | null
          id: string
          status: string
          workspace_id: string
        }
        Insert: {
          area: string
          case_number: string
          client_name: string
          created_at?: string
          description?: string | null
          id?: string
          status: string
          workspace_id: string
        }
        Update: {
          area?: string
          case_number?: string
          client_name?: string
          created_at?: string
          description?: string | null
          id?: string
          status?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "processes_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string
          id: string
          role: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          full_name: string
          id: string
          role?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          full_name?: string
          id?: string
          role?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      stf_julgados: {
        Row: {
          arquivo: string | null
          citacao: string
          classe: string
          colecao: string
          confianca: string
          data: string | null
          fonte_pagina: number | null
          fonte_url: string | null
          id: string
          ministro: string | null
          numero: string
          orgao: string | null
          publicacao: string | null
          redator_acordao: string | null
          relator: string | null
          sufixo: string | null
          tema_rg: string | null
        }
        Insert: {
          arquivo?: string | null
          citacao: string
          classe: string
          colecao: string
          confianca?: string
          data?: string | null
          fonte_pagina?: number | null
          fonte_url?: string | null
          id?: string
          ministro?: string | null
          numero: string
          orgao?: string | null
          publicacao?: string | null
          redator_acordao?: string | null
          relator?: string | null
          sufixo?: string | null
          tema_rg?: string | null
        }
        Update: {
          arquivo?: string | null
          citacao?: string
          classe?: string
          colecao?: string
          confianca?: string
          data?: string | null
          fonte_pagina?: number | null
          fonte_url?: string | null
          id?: string
          ministro?: string | null
          numero?: string
          orgao?: string | null
          publicacao?: string | null
          redator_acordao?: string | null
          relator?: string | null
          sufixo?: string | null
          tema_rg?: string | null
        }
        Relationships: []
      }
      stf_sumulas: {
        Row: {
          confianca: string
          data_aprovacao: string | null
          enunciado: string
          enunciado_fonte_data: string | null
          fonte_arquivo: string | null
          fonte_documento: string | null
          fonte_pagina: number | null
          fonte_url: string | null
          id: string
          n_precedentes: number
          nota_situacao: string | null
          numero: number
          situacao: string
          situacao_data: string | null
          situacao_fonte: string | null
          tipo: string
        }
        Insert: {
          confianca?: string
          data_aprovacao?: string | null
          enunciado: string
          enunciado_fonte_data?: string | null
          fonte_arquivo?: string | null
          fonte_documento?: string | null
          fonte_pagina?: number | null
          fonte_url?: string | null
          id?: string
          n_precedentes?: number
          nota_situacao?: string | null
          numero: number
          situacao?: string
          situacao_data?: string | null
          situacao_fonte?: string | null
          tipo?: string
        }
        Update: {
          confianca?: string
          data_aprovacao?: string | null
          enunciado?: string
          enunciado_fonte_data?: string | null
          fonte_arquivo?: string | null
          fonte_documento?: string | null
          fonte_pagina?: number | null
          fonte_url?: string | null
          id?: string
          n_precedentes?: number
          nota_situacao?: string | null
          numero?: number
          situacao?: string
          situacao_data?: string | null
          situacao_fonte?: string | null
          tipo?: string
        }
        Relationships: []
      }
      stf_temas: {
        Row: {
          classe: string | null
          colhido_em: string
          data_andamento: string | null
          fonte_url: string | null
          id: string
          incidente: string | null
          normalizada: boolean
          numero: number
          processo: string | null
          tem_rg: boolean
          tese: string
          tese_bruta: string | null
        }
        Insert: {
          classe?: string | null
          colhido_em?: string
          data_andamento?: string | null
          fonte_url?: string | null
          id?: string
          incidente?: string | null
          normalizada?: boolean
          numero: number
          processo?: string | null
          tem_rg: boolean
          tese: string
          tese_bruta?: string | null
        }
        Update: {
          classe?: string | null
          colhido_em?: string
          data_andamento?: string | null
          fonte_url?: string | null
          id?: string
          incidente?: string | null
          normalizada?: boolean
          numero?: number
          processo?: string | null
          tem_rg?: boolean
          tese?: string
          tese_bruta?: string | null
        }
        Relationships: []
      }
      stj_sumulas: {
        Row: {
          confianca: string
          data_julgamento: string | null
          data_publicacao: string | null
          enunciado: string
          fonte_arquivo: string | null
          fonte_documento: string | null
          fonte_pagina: number | null
          fonte_url: string | null
          id: string
          nota_situacao: string | null
          numero: number
          orgao: string | null
          ramo: string | null
          redacao_anterior: string | null
          situacao: string
          situacao_data: string | null
          situacao_fonte: string | null
          veiculo: string | null
        }
        Insert: {
          confianca?: string
          data_julgamento?: string | null
          data_publicacao?: string | null
          enunciado: string
          fonte_arquivo?: string | null
          fonte_documento?: string | null
          fonte_pagina?: number | null
          fonte_url?: string | null
          id?: string
          nota_situacao?: string | null
          numero: number
          orgao?: string | null
          ramo?: string | null
          redacao_anterior?: string | null
          situacao?: string
          situacao_data?: string | null
          situacao_fonte?: string | null
          veiculo?: string | null
        }
        Update: {
          confianca?: string
          data_julgamento?: string | null
          data_publicacao?: string | null
          enunciado?: string
          fonte_arquivo?: string | null
          fonte_documento?: string | null
          fonte_pagina?: number | null
          fonte_url?: string | null
          id?: string
          nota_situacao?: string | null
          numero?: number
          orgao?: string | null
          ramo?: string | null
          redacao_anterior?: string | null
          situacao?: string
          situacao_data?: string | null
          situacao_fonte?: string | null
          veiculo?: string | null
        }
        Relationships: []
      }
      stj_tese_julgados: {
        Row: {
          citacao: string | null
          classe: string | null
          data: string | null
          id: string
          monocratica: boolean
          numero: string | null
          orgao: string | null
          relator: string | null
          tese_id: string
          tipo_data: string | null
          uf: string | null
        }
        Insert: {
          citacao?: string | null
          classe?: string | null
          data?: string | null
          id?: string
          monocratica?: boolean
          numero?: string | null
          orgao?: string | null
          relator?: string | null
          tese_id: string
          tipo_data?: string | null
          uf?: string | null
        }
        Update: {
          citacao?: string | null
          classe?: string | null
          data?: string | null
          id?: string
          monocratica?: boolean
          numero?: string | null
          orgao?: string | null
          relator?: string | null
          tese_id?: string
          tipo_data?: string | null
          uf?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stj_tese_julgados_tese_id_fkey"
            columns: ["tese_id"]
            isOneToOne: false
            referencedRelation: "stj_teses"
            referencedColumns: ["id"]
          },
        ]
      }
      stj_teses: {
        Row: {
          area: string | null
          base_legal: string | null
          edicao: number | null
          fonte_arquivo: string | null
          fonte_pagina: number | null
          fonte_url: string | null
          id: string
          numero_tese: number | null
          tema_repetitivo: string | null
          tese_text: string
        }
        Insert: {
          area?: string | null
          base_legal?: string | null
          edicao?: number | null
          fonte_arquivo?: string | null
          fonte_pagina?: number | null
          fonte_url?: string | null
          id?: string
          numero_tese?: number | null
          tema_repetitivo?: string | null
          tese_text: string
        }
        Update: {
          area?: string | null
          base_legal?: string | null
          edicao?: number | null
          fonte_arquivo?: string | null
          fonte_pagina?: number | null
          fonte_url?: string | null
          id?: string
          numero_tese?: number | null
          tema_repetitivo?: string | null
          tese_text?: string
        }
        Relationships: []
      }
      tse_sumulas: {
        Row: {
          colhido_em: string
          composicao: string | null
          enunciado: string | null
          fonte_documento: string | null
          fonte_pagina: number | null
          fonte_url: string | null
          id: string
          marca: string | null
          nota_cancelamento: string | null
          notas: string[]
          numero: number
          origem_redacao_atual: string | null
          publicacao: string | null
          redacao_original: string | null
          referencias: string | null
          situacao: string
          titulo_bruto: string
        }
        Insert: {
          colhido_em?: string
          composicao?: string | null
          enunciado?: string | null
          fonte_documento?: string | null
          fonte_pagina?: number | null
          fonte_url?: string | null
          id?: string
          marca?: string | null
          nota_cancelamento?: string | null
          notas?: string[]
          numero: number
          origem_redacao_atual?: string | null
          publicacao?: string | null
          redacao_original?: string | null
          referencias?: string | null
          situacao?: string
          titulo_bruto: string
        }
        Update: {
          colhido_em?: string
          composicao?: string | null
          enunciado?: string | null
          fonte_documento?: string | null
          fonte_pagina?: number | null
          fonte_url?: string | null
          id?: string
          marca?: string | null
          nota_cancelamento?: string | null
          notas?: string[]
          numero?: number
          origem_redacao_atual?: string | null
          publicacao?: string | null
          redacao_original?: string | null
          referencias?: string | null
          situacao?: string
          titulo_bruto?: string
        }
        Relationships: []
      }
      tst_precedentes: {
        Row: {
          assunto: string | null
          colhido_em: string
          decisao: string | null
          fonte_documento: string | null
          fonte_pagina: number | null
          fonte_url: string | null
          id: string
          numero: number
          observacao_nugep: string | null
          ocorrencias: number
          processos: string
          secoes: string[]
          tese: string | null
          tese_firmada: string | null
          tipo: string
          titulo: string | null
          transito_julgado: string | null
          tribunal: string | null
        }
        Insert: {
          assunto?: string | null
          colhido_em?: string
          decisao?: string | null
          fonte_documento?: string | null
          fonte_pagina?: number | null
          fonte_url?: string | null
          id?: string
          numero: number
          observacao_nugep?: string | null
          ocorrencias?: number
          processos: string
          secoes?: string[]
          tese?: string | null
          tese_firmada?: string | null
          tipo: string
          titulo?: string | null
          transito_julgado?: string | null
          tribunal?: string | null
        }
        Update: {
          assunto?: string | null
          colhido_em?: string
          decisao?: string | null
          fonte_documento?: string | null
          fonte_pagina?: number | null
          fonte_url?: string | null
          id?: string
          numero?: number
          observacao_nugep?: string | null
          ocorrencias?: number
          processos?: string
          secoes?: string[]
          tese?: string | null
          tese_firmada?: string | null
          tipo?: string
          titulo?: string | null
          transito_julgado?: string | null
          tribunal?: string | null
        }
        Relationships: []
      }
      tst_sumulas: {
        Row: {
          colhido_em: string
          fonte_documento: string | null
          fonte_pagina: number | null
          fonte_url: string | null
          historico: string | null
          id: string
          marcas: string[]
          natureza: string | null
          numero: number
          situacao: string
          texto: string | null
          tipo: string
          titulo: string | null
          titulo_bruto: string
        }
        Insert: {
          colhido_em?: string
          fonte_documento?: string | null
          fonte_pagina?: number | null
          fonte_url?: string | null
          historico?: string | null
          id?: string
          marcas?: string[]
          natureza?: string | null
          numero: number
          situacao?: string
          texto?: string | null
          tipo: string
          titulo?: string | null
          titulo_bruto: string
        }
        Update: {
          colhido_em?: string
          fonte_documento?: string | null
          fonte_pagina?: number | null
          fonte_url?: string | null
          historico?: string | null
          id?: string
          marcas?: string[]
          natureza?: string | null
          numero?: number
          situacao?: string
          texto?: string | null
          tipo?: string
          titulo?: string | null
          titulo_bruto?: string
        }
        Relationships: []
      }
      workspace_branding: {
        Row: {
          cabecalho_extra: string
          cor_primaria: string
          cor_secundaria: string
          email: string
          endereco_cep: string
          endereco_cidade: string
          endereco_logradouro: string
          endereco_uf: string
          logo_path: string
          nome_escritorio: string
          oab_responsavel_nome: string
          oab_responsavel_numero: string
          oab_responsavel_uf: string
          rodape_confidencialidade: string
          telefone: string
          updated_at: string
          website: string
          workspace_id: string
        }
        Insert: {
          cabecalho_extra?: string
          cor_primaria?: string
          cor_secundaria?: string
          email?: string
          endereco_cep?: string
          endereco_cidade?: string
          endereco_logradouro?: string
          endereco_uf?: string
          logo_path?: string
          nome_escritorio?: string
          oab_responsavel_nome?: string
          oab_responsavel_numero?: string
          oab_responsavel_uf?: string
          rodape_confidencialidade?: string
          telefone?: string
          updated_at?: string
          website?: string
          workspace_id: string
        }
        Update: {
          cabecalho_extra?: string
          cor_primaria?: string
          cor_secundaria?: string
          email?: string
          endereco_cep?: string
          endereco_cidade?: string
          endereco_logradouro?: string
          endereco_uf?: string
          logo_path?: string
          nome_escritorio?: string
          oab_responsavel_nome?: string
          oab_responsavel_numero?: string
          oab_responsavel_uf?: string
          rodape_confidencialidade?: string
          telefone?: string
          updated_at?: string
          website?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_branding_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_invitations: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          email: string
          id: string
          invited_by: string | null
          role: string
          status: string
          workspace_id: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email: string
          id?: string
          invited_by?: string | null
          role?: string
          status?: string
          workspace_id: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email?: string
          id?: string
          invited_by?: string | null
          role?: string
          status?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_invitations_accepted_by_fkey"
            columns: ["accepted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_invitations_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_invitations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          budget_mensal_usd: number
          busca_externa: boolean
          created_at: string
          id: string
          name: string
          plano: string
        }
        Insert: {
          budget_mensal_usd?: number
          busca_externa?: boolean
          created_at?: string
          id?: string
          name: string
          plano?: string
        }
        Update: {
          budget_mensal_usd?: number
          busca_externa?: boolean
          created_at?: string
          id?: string
          name?: string
          plano?: string
        }
        Relationships: []
      }
    }
    Views: {
      vw_precver_integridade: {
        Row: {
          dia: string | null
          id: string | null
          n_citacoes: number | null
          nao_contados: number | null
          somados: number | null
        }
        Insert: {
          dia?: never
          id?: string | null
          n_citacoes?: number | null
          nao_contados?: never
          somados?: never
        }
        Update: {
          dia?: never
          id?: string | null
          n_citacoes?: number | null
          nao_contados?: never
          somados?: never
        }
        Relationships: []
      }
      vw_recent_invocations: {
        Row: {
          agent_id: string | null
          agent_model: string | null
          agent_name: string | null
          created_at: string | null
          currency: string | null
          estimated_cost: number | null
          id: string | null
          input_tokens: number | null
          output_tokens: number | null
          process_id: string | null
          user_id: string | null
          user_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invocacoes_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agentes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invocacoes_process_id_fkey"
            columns: ["process_id"]
            isOneToOne: false
            referencedRelation: "processes"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      acessos_do_documento: {
        Args: { p_file_path: string }
        Returns: {
          acao: string
          detalhe: string
          origem: string
          quando: string
          quem: string
        }[]
      }
      admin_remove_member: { Args: { p_member: string }; Returns: undefined }
      admin_set_member_role: {
        Args: { p_member: string; p_role: string }
        Returns: undefined
      }
      anexos_a_expirar: {
        Args: { p_dias_aviso?: number }
        Returns: {
          created_at: string
          dias_restantes: number
          file_name: string
          file_path: string
          file_size: number
          id: string
          ja_avisado: boolean
        }[]
      }
      anexos_expirados: {
        Args: { p_dias?: number }
        Returns: {
          created_at: string
          dias_de_vida: number
          file_name: string
          file_path: string
          file_size: number
          id: string
          workspace_id: string
        }[]
      }
      carf_sumula: {
        Args: { p_numero: number; p_tese?: string }
        Returns: {
          aprovada_em: string
          colhido_em: string
          enunciado: string
          fonte_url: string
          notas: string[]
          numero: number
          orgao: string
          portaria_vinculante: string
          precedentes: string
          sim: number
          situacao: string
          url_portaria: string
          vinculante: boolean
        }[]
      }
      carf_sumula_limite: { Args: never; Returns: number }
      creditos_do_mes: { Args: never; Returns: Json }
      creditos_do_plano: { Args: { p_plano: string }; Returns: number }
      current_user_role: { Args: never; Returns: string }
      current_workspace_id: { Args: never; Returns: string }
      get_agent_ranking: {
        Args: { end_date: string; start_date: string }
        Returns: {
          agent_id: string
          agent_name: string
          invocations_count: number
          total_cost: number
          total_tokens: number
        }[]
      }
      get_daily_consumption: {
        Args: { end_date: string; start_date: string }
        Returns: {
          cost: number
          date: string
          invocations: number
        }[]
      }
      get_user_ranking: {
        Args: { end_date: string; start_date: string }
        Returns: {
          full_name: string
          invocations_count: number
          last_activity: string
          total_cost: number
          user_id: string
        }[]
      }
      plano_do_workspace: { Args: { p_workspace: string }; Returns: string }
      precedent_verifications_hoje: { Args: never; Returns: number }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      stf_lookup: {
        Args: { p_classe?: string; p_numero: string }
        Returns: {
          arquivo: string
          citacao: string
          classe: string
          colecao: string
          confianca: string
          data: string
          fonte_pagina: number
          fonte_url: string
          ministro: string
          numero: string
          orgao: string
          publicacao: string
          redator_acordao: string
          relator: string
          sufixo: string
          tema_rg: string
        }[]
      }
      stf_sumula: {
        Args: { p_numero: number; p_tese?: string; p_vinculante?: boolean }
        Returns: {
          data_aprovacao: string
          enunciado: string
          enunciado_fonte_data: string
          fonte_arquivo: string
          fonte_pagina: number
          fonte_url: string
          n_precedentes: number
          nota_situacao: string
          numero: number
          sim: number
          situacao: string
          situacao_data: string
          tipo: string
        }[]
      }
      stf_tema: {
        Args: { p_numero: number; p_tese?: string }
        Returns: {
          classe: string
          colhido_em: string
          data_andamento: string
          fonte_url: string
          numero: number
          processo: string
          sim: number
          tem_rg: boolean
          tese: string
        }[]
      }
      stj_lookup: {
        Args: { p_numero: string; p_tese: string; p_uf: string }
        Returns: {
          area: string
          citacao: string
          classe: string
          data: string
          edicao: number
          fonte_pagina: number
          fonte_url: string
          nota_situacao: string
          numero_tese: number
          orgao: string
          relator: string
          sim: number
          situacao: string
          situacao_data: string
          tese_text: string
          tipo_data: string
          uf: string
        }[]
      }
      stj_sumula: {
        Args: { p_numero: number; p_tese?: string }
        Returns: {
          area: string
          data_publicacao: string
          enunciado: string
          fonte_arquivo: string
          fonte_pagina: number
          fonte_url: string
          nota_situacao: string
          numero_tese: number
          redacao_anterior: string
          sim: number
          sim_anterior: number
          situacao: string
          situacao_data: string
        }[]
      }
      sumula_limites: {
        Args: never
        Returns: {
          base: string
          maximo: number
          ultima_publicacao: string
        }[]
      }
      tse_sumula: {
        Args: { p_numero: number; p_tese?: string }
        Returns: {
          colhido_em: string
          enunciado: string
          fonte_pagina: number
          fonte_url: string
          nota_cancelamento: string
          notas: string[]
          numero: number
          origem_redacao_atual: string
          publicacao: string
          redacao_original: string
          referencias: string
          sim: number
          sim_original: number
          situacao: string
          titulo_bruto: string
        }[]
      }
      tse_sumula_limite: { Args: never; Returns: number }
      tst_precedente: {
        Args: { p_numero: number; p_tese?: string; p_tipo: string }
        Returns: {
          colhido_em: string
          fonte_pagina: number
          fonte_url: string
          numero: number
          observacao_nugep: string
          processos: string
          secoes: string[]
          sim: number
          tese: string
          tese_firmada: string
          tipo: string
          titulo: string
          transito_julgado: string
          tribunal: string
        }[]
      }
      tst_sumula: {
        Args: { p_numero: number; p_tese?: string; p_tipo: string }
        Returns: {
          colhido_em: string
          fonte_pagina: number
          fonte_url: string
          historico: string
          marcas: string[]
          natureza: string
          numero: number
          sim: number
          situacao: string
          texto: string
          tipo: string
          titulo: string
          titulo_bruto: string
        }[]
      }
      tst_sumula_limites: {
        Args: never
        Returns: {
          maximo: number
          tipo: string
        }[]
      }
      workspace_founder: { Args: { p_ws: string }; Returns: string }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
