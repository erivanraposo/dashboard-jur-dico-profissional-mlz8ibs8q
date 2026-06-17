// AVOID UPDATING THIS FILE DIRECTLY. It is automatically generated.
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: '14.5'
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
            foreignKeyName: 'clipped_cases_jurisprudence_id_fkey'
            columns: ['jurisprudence_id']
            isOneToOne: false
            referencedRelation: 'jurisprudence'
            referencedColumns: ['id']
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
        }
        Relationships: [
          {
            foreignKeyName: 'custos_invocation_id_fkey'
            columns: ['invocation_id']
            isOneToOne: true
            referencedRelation: 'invocacoes'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'custos_invocation_id_fkey'
            columns: ['invocation_id']
            isOneToOne: true
            referencedRelation: 'vw_recent_invocations'
            referencedColumns: ['id']
          },
        ]
      }
      invocacoes: {
        Row: {
          agent_id: string
          created_at: string
          diagnostic_log: string | null
          id: string
          input_tokens: number
          output_tokens: number
          process_id: string | null
          user_id: string
        }
        Insert: {
          agent_id: string
          created_at?: string
          diagnostic_log?: string | null
          id?: string
          input_tokens?: number
          output_tokens?: number
          process_id?: string | null
          user_id: string
        }
        Update: {
          agent_id?: string
          created_at?: string
          diagnostic_log?: string | null
          id?: string
          input_tokens?: number
          output_tokens?: number
          process_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'invocacoes_agent_id_fkey'
            columns: ['agent_id']
            isOneToOne: false
            referencedRelation: 'agentes'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'invocacoes_process_id_fkey'
            columns: ['process_id']
            isOneToOne: false
            referencedRelation: 'processes'
            referencedColumns: ['id']
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
        }
        Insert: {
          created_at?: string
          full_name: string
          id?: string
          oab_number: string
        }
        Update: {
          created_at?: string
          full_name?: string
          id?: string
          oab_number?: string
        }
        Relationships: []
      }
      minutes: {
        Row: {
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
          status: string
          title: string
          updated_at: string
        }
        Insert: {
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
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
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
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'minutes_invocation_id_fkey'
            columns: ['invocation_id']
            isOneToOne: false
            referencedRelation: 'invocacoes'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'minutes_invocation_id_fkey'
            columns: ['invocation_id']
            isOneToOne: false
            referencedRelation: 'vw_recent_invocations'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'minutes_lawyer_id_fkey'
            columns: ['lawyer_id']
            isOneToOne: false
            referencedRelation: 'lawyers'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'minutes_process_id_fkey'
            columns: ['process_id']
            isOneToOne: false
            referencedRelation: 'processes'
            referencedColumns: ['id']
          },
        ]
      }
      process_attachments: {
        Row: {
          created_at: string
          file_name: string
          file_path: string
          file_size: number
          file_type: string
          id: string
          process_id: string | null
        }
        Insert: {
          created_at?: string
          file_name: string
          file_path: string
          file_size: number
          file_type: string
          id?: string
          process_id?: string | null
        }
        Update: {
          created_at?: string
          file_name?: string
          file_path?: string
          file_size?: number
          file_type?: string
          id?: string
          process_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'process_attachments_process_id_fkey'
            columns: ['process_id']
            isOneToOne: false
            referencedRelation: 'processes'
            referencedColumns: ['id']
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
        }
        Insert: {
          area: string
          case_number: string
          client_name: string
          created_at?: string
          description?: string | null
          id?: string
          status: string
        }
        Update: {
          area?: string
          case_number?: string
          client_name?: string
          created_at?: string
          description?: string | null
          id?: string
          status?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string
          id: string
          role: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          full_name: string
          id: string
          role?: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          full_name?: string
          id?: string
          role?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'profiles_workspace_id_fkey'
            columns: ['workspace_id']
            isOneToOne: false
            referencedRelation: 'workspaces'
            referencedColumns: ['id']
          },
        ]
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
            foreignKeyName: 'workspace_branding_workspace_id_fkey'
            columns: ['workspace_id']
            isOneToOne: true
            referencedRelation: 'workspaces'
            referencedColumns: ['id']
          },
        ]
      }
      workspaces: {
        Row: {
          budget_mensal_usd: number
          created_at: string
          id: string
          name: string
        }
        Insert: {
          budget_mensal_usd?: number
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          budget_mensal_usd?: number
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
    }
    Views: {
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
            foreignKeyName: 'invocacoes_agent_id_fkey'
            columns: ['agent_id']
            isOneToOne: false
            referencedRelation: 'agentes'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'invocacoes_process_id_fkey'
            columns: ['process_id']
            isOneToOne: false
            referencedRelation: 'processes'
            referencedColumns: ['id']
          },
        ]
      }
    }
    Functions: {
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
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema['Enums']
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema['CompositeTypes']
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
