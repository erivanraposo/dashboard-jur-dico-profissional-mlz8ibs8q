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
          cached_tokens: number
          created_at: string
          currency: string
          estimated_cost: number
          id: string
          invocation_id: string
        }
        Insert: {
          cached_tokens?: number
          created_at?: string
          currency?: string
          estimated_cost?: number
          id?: string
          invocation_id: string
        }
        Update: {
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
            isOneToOne: false
            referencedRelation: 'invocacoes'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'custos_invocation_id_fkey'
            columns: ['invocation_id']
            isOneToOne: false
            referencedRelation: 'vw_recent_invocations'
            referencedColumns: ['id']
          },
        ]
      }
      invocacoes: {
        Row: {
          agent_id: string
          created_at: string
          id: string
          input_tokens: number
          output_tokens: number
          process_id: string | null
          user_id: string
        }
        Insert: {
          agent_id: string
          created_at?: string
          id?: string
          input_tokens?: number
          output_tokens?: number
          process_id?: string | null
          user_id: string
        }
        Update: {
          agent_id?: string
          created_at?: string
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
          content: string
          created_at: string
          id: string
          lawyer_id: string | null
          process_id: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          lawyer_id?: string | null
          process_id?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          lawyer_id?: string | null
          process_id?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
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
          process_id: string
        }
        Insert: {
          created_at?: string
          file_name: string
          file_path: string
          file_size: number
          file_type: string
          id?: string
          process_id: string
        }
        Update: {
          created_at?: string
          file_name?: string
          file_path?: string
          file_size?: number
          file_type?: string
          id?: string
          process_id?: string
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

// ====== DATABASE EXTENDED CONTEXT (auto-generated) ======
// This section contains actual PostgreSQL column types, constraints, RLS policies,
// functions, triggers, indexes and materialized views not present in the type definitions above.
// IMPORTANT: The TypeScript types above map UUID, TEXT, VARCHAR all to "string".
// Use the COLUMN TYPES section below to know the real PostgreSQL type for each column.
// Always use the correct PostgreSQL type when writing SQL migrations.

// --- COLUMN TYPES (actual PostgreSQL types) ---
// Use this to know the real database type when writing migrations.
// "string" in TypeScript types above may be uuid, text, varchar, timestamptz, etc.
// Table: agentes
//   id: uuid (not null, default: gen_random_uuid())
//   name: text (not null)
//   description: text (nullable)
//   system_prompt: text (not null)
//   model: text (not null)
//   is_active: boolean (not null, default: true)
//   created_at: timestamp with time zone (not null, default: now())
//   titulo: text (nullable)
//   descricao: text (nullable)
//   categoria: text (nullable)
//   max_tokens: integer (nullable, default: 4096)
//   thinking_mode: text (nullable, default: 'disabled'::text)
//   effort: text (nullable, default: 'low'::text)
//   tools: jsonb (nullable, default: '[]'::jsonb)
//   versao: integer (nullable, default: 1)
// Table: clipped_cases
//   id: uuid (not null, default: gen_random_uuid())
//   user_id: uuid (nullable)
//   jurisprudence_id: uuid (nullable)
//   created_at: timestamp with time zone (not null, default: now())
// Table: custos
//   id: uuid (not null, default: gen_random_uuid())
//   invocation_id: uuid (not null)
//   estimated_cost: numeric (not null, default: 0)
//   currency: text (not null, default: 'USD'::text)
//   cached_tokens: integer (not null, default: 0)
//   created_at: timestamp with time zone (not null, default: now())
// Table: invocacoes
//   id: uuid (not null, default: gen_random_uuid())
//   user_id: uuid (not null)
//   agent_id: uuid (not null)
//   process_id: uuid (nullable)
//   input_tokens: integer (not null, default: 0)
//   output_tokens: integer (not null, default: 0)
//   created_at: timestamp with time zone (not null, default: now())
// Table: jurisprudence
//   id: uuid (not null, default: gen_random_uuid())
//   court: text (not null)
//   summary: text (not null)
//   full_text: text (nullable)
//   link: text (nullable)
//   tags: _text (nullable)
//   created_at: timestamp with time zone (not null, default: now())
// Table: lawyers
//   id: uuid (not null, default: gen_random_uuid())
//   full_name: text (not null)
//   oab_number: text (not null)
//   created_at: timestamp with time zone (not null, default: now())
// Table: minutes
//   id: uuid (not null, default: gen_random_uuid())
//   process_id: uuid (nullable)
//   lawyer_id: uuid (nullable)
//   title: text (not null)
//   content: text (not null)
//   status: text (not null, default: 'Draft'::text)
//   created_at: timestamp with time zone (not null, default: now())
//   updated_at: timestamp with time zone (not null, default: now())
// Table: process_attachments
//   id: uuid (not null, default: gen_random_uuid())
//   process_id: uuid (not null)
//   file_name: text (not null)
//   file_path: text (not null)
//   file_type: text (not null)
//   file_size: bigint (not null)
//   created_at: timestamp with time zone (not null, default: now())
// Table: processes
//   id: uuid (not null, default: gen_random_uuid())
//   case_number: text (not null)
//   client_name: text (not null)
//   area: text (not null)
//   status: text (not null)
//   description: text (nullable)
//   created_at: timestamp with time zone (not null, default: now())
// Table: profiles
//   id: uuid (not null)
//   workspace_id: uuid (nullable)
//   full_name: text (not null)
//   role: text (not null, default: 'member'::text)
//   created_at: timestamp with time zone (not null, default: now())
// Table: vw_recent_invocations
//   id: uuid (nullable)
//   created_at: timestamp with time zone (nullable)
//   input_tokens: integer (nullable)
//   output_tokens: integer (nullable)
//   user_id: uuid (nullable)
//   agent_id: uuid (nullable)
//   process_id: uuid (nullable)
//   estimated_cost: numeric (nullable)
//   currency: text (nullable)
//   agent_name: text (nullable)
//   agent_model: text (nullable)
//   user_name: text (nullable)
// Table: workspaces
//   id: uuid (not null, default: gen_random_uuid())
//   name: text (not null)
//   budget_mensal_usd: numeric (not null, default: 0)
//   created_at: timestamp with time zone (not null, default: now())

// --- CONSTRAINTS ---
// Table: agentes
//   UNIQUE agentes_name_key: UNIQUE (name)
//   PRIMARY KEY agentes_pkey: PRIMARY KEY (id)
// Table: clipped_cases
//   FOREIGN KEY clipped_cases_jurisprudence_id_fkey: FOREIGN KEY (jurisprudence_id) REFERENCES jurisprudence(id)
//   PRIMARY KEY clipped_cases_pkey: PRIMARY KEY (id)
//   FOREIGN KEY clipped_cases_user_id_fkey: FOREIGN KEY (user_id) REFERENCES auth.users(id)
//   UNIQUE clipped_cases_user_id_jurisprudence_id_key: UNIQUE (user_id, jurisprudence_id)
// Table: custos
//   FOREIGN KEY custos_invocation_id_fkey: FOREIGN KEY (invocation_id) REFERENCES invocacoes(id) ON DELETE CASCADE
//   PRIMARY KEY custos_pkey: PRIMARY KEY (id)
// Table: invocacoes
//   FOREIGN KEY invocacoes_agent_id_fkey: FOREIGN KEY (agent_id) REFERENCES agentes(id) ON DELETE CASCADE
//   PRIMARY KEY invocacoes_pkey: PRIMARY KEY (id)
//   FOREIGN KEY invocacoes_process_id_fkey: FOREIGN KEY (process_id) REFERENCES processes(id) ON DELETE SET NULL
//   FOREIGN KEY invocacoes_user_id_fkey: FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
// Table: jurisprudence
//   PRIMARY KEY jurisprudence_pkey: PRIMARY KEY (id)
// Table: lawyers
//   PRIMARY KEY lawyers_pkey: PRIMARY KEY (id)
// Table: minutes
//   FOREIGN KEY minutes_lawyer_id_fkey: FOREIGN KEY (lawyer_id) REFERENCES lawyers(id)
//   PRIMARY KEY minutes_pkey: PRIMARY KEY (id)
//   FOREIGN KEY minutes_process_id_fkey: FOREIGN KEY (process_id) REFERENCES processes(id)
// Table: process_attachments
//   PRIMARY KEY process_attachments_pkey: PRIMARY KEY (id)
//   FOREIGN KEY process_attachments_process_id_fkey: FOREIGN KEY (process_id) REFERENCES processes(id) ON DELETE CASCADE
// Table: processes
//   PRIMARY KEY processes_pkey: PRIMARY KEY (id)
// Table: profiles
//   FOREIGN KEY profiles_id_fkey: FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE
//   PRIMARY KEY profiles_pkey: PRIMARY KEY (id)
//   CHECK profiles_role_check: CHECK ((role = ANY (ARRAY['admin'::text, 'owner'::text, 'member'::text, 'viewer'::text])))
//   FOREIGN KEY profiles_workspace_id_fkey: FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE SET NULL
// Table: workspaces
//   PRIMARY KEY workspaces_pkey: PRIMARY KEY (id)

// --- ROW LEVEL SECURITY POLICIES ---
// Table: agentes
//   Policy "authenticated_select_agentes" (SELECT, PERMISSIVE) roles={authenticated}
//     USING: true
// Table: clipped_cases
//   Policy "authenticated_all_clipped_cases" (ALL, PERMISSIVE) roles={authenticated}
//     USING: (auth.uid() = user_id)
//     WITH CHECK: (auth.uid() = user_id)
// Table: custos
//   Policy "authenticated_insert_custos" (INSERT, PERMISSIVE) roles={authenticated}
//     WITH CHECK: (EXISTS ( SELECT 1    FROM invocacoes i   WHERE ((i.id = custos.invocation_id) AND (i.user_id = auth.uid()))))
//   Policy "authenticated_select_custos" (SELECT, PERMISSIVE) roles={authenticated}
//     USING: (EXISTS ( SELECT 1    FROM invocacoes i   WHERE ((i.id = custos.invocation_id) AND ((i.user_id = auth.uid()) OR (EXISTS ( SELECT 1            FROM profiles           WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'owner'::text])))))))))
// Table: invocacoes
//   Policy "authenticated_insert_invocacoes" (INSERT, PERMISSIVE) roles={authenticated}
//     WITH CHECK: (auth.uid() = user_id)
//   Policy "authenticated_select_invocacoes" (SELECT, PERMISSIVE) roles={authenticated}
//     USING: ((user_id = auth.uid()) OR (EXISTS ( SELECT 1    FROM profiles   WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'owner'::text]))))))
// Table: jurisprudence
//   Policy "authenticated_all_jurisprudence" (ALL, PERMISSIVE) roles={authenticated}
//     USING: true
//     WITH CHECK: true
// Table: lawyers
//   Policy "authenticated_select_lawyers" (SELECT, PERMISSIVE) roles={authenticated}
//     USING: true
// Table: minutes
//   Policy "authenticated_all_minutes" (ALL, PERMISSIVE) roles={authenticated}
//     USING: true
//     WITH CHECK: true
// Table: process_attachments
//   Policy "authenticated_all_process_attachments" (ALL, PERMISSIVE) roles={authenticated}
//     USING: true
//     WITH CHECK: true
// Table: processes
//   Policy "authenticated_all_processes" (ALL, PERMISSIVE) roles={authenticated}
//     USING: true
//     WITH CHECK: true
// Table: profiles
//   Policy "authenticated_select_profiles" (SELECT, PERMISSIVE) roles={authenticated}
//     USING: (workspace_id IN ( SELECT profiles_1.workspace_id    FROM profiles profiles_1   WHERE (profiles_1.id = auth.uid())))
// Table: workspaces
//   Policy "authenticated_select_workspaces" (SELECT, PERMISSIVE) roles={authenticated}
//     USING: (EXISTS ( SELECT 1    FROM profiles   WHERE ((profiles.workspace_id = workspaces.id) AND (profiles.id = auth.uid()))))

// --- DATABASE FUNCTIONS ---
// FUNCTION get_agent_ranking(timestamp with time zone, timestamp with time zone)
//   CREATE OR REPLACE FUNCTION public.get_agent_ranking(start_date timestamp with time zone, end_date timestamp with time zone)
//    RETURNS TABLE(agent_id uuid, agent_name text, invocations_count bigint, total_tokens bigint, total_cost numeric)
//    LANGUAGE plpgsql
//   AS $function$
//   BEGIN
//     RETURN QUERY
//     SELECT
//       a.id,
//       a.name,
//       COUNT(i.id) AS invocations_count,
//       COALESCE(SUM(i.input_tokens + i.output_tokens), 0) AS total_tokens,
//       COALESCE(SUM(c.estimated_cost), 0) AS total_cost
//     FROM public.invocacoes i
//     JOIN public.agentes a ON a.id = i.agent_id
//     LEFT JOIN public.custos c ON c.invocation_id = i.id
//     WHERE i.created_at >= start_date AND i.created_at <= end_date
//     GROUP BY a.id, a.name
//     ORDER BY total_cost DESC;
//   END;
//   $function$
//
// FUNCTION get_daily_consumption(timestamp with time zone, timestamp with time zone)
//   CREATE OR REPLACE FUNCTION public.get_daily_consumption(start_date timestamp with time zone, end_date timestamp with time zone)
//    RETURNS TABLE(date text, cost numeric, invocations bigint)
//    LANGUAGE plpgsql
//   AS $function$
//   BEGIN
//     RETURN QUERY
//     SELECT
//       TO_CHAR(date_trunc('day', i.created_at), 'YYYY-MM-DD') AS date,
//       COALESCE(SUM(c.estimated_cost), 0) AS cost,
//       COUNT(i.id) AS invocations
//     FROM public.invocacoes i
//     LEFT JOIN public.custos c ON c.invocation_id = i.id
//     WHERE i.created_at >= start_date AND i.created_at <= end_date
//     GROUP BY date_trunc('day', i.created_at)
//     ORDER BY date_trunc('day', i.created_at) ASC;
//   END;
//   $function$
//
// FUNCTION get_user_ranking(timestamp with time zone, timestamp with time zone)
//   CREATE OR REPLACE FUNCTION public.get_user_ranking(start_date timestamp with time zone, end_date timestamp with time zone)
//    RETURNS TABLE(user_id uuid, full_name text, invocations_count bigint, total_cost numeric, last_activity timestamp with time zone)
//    LANGUAGE plpgsql
//   AS $function$
//   BEGIN
//     RETURN QUERY
//     SELECT
//       p.id,
//       p.full_name,
//       COUNT(i.id) AS invocations_count,
//       COALESCE(SUM(c.estimated_cost), 0) AS total_cost,
//       MAX(i.created_at) AS last_activity
//     FROM public.invocacoes i
//     JOIN public.profiles p ON p.id = i.user_id
//     LEFT JOIN public.custos c ON c.invocation_id = i.id
//     WHERE i.created_at >= start_date AND i.created_at <= end_date
//     GROUP BY p.id, p.full_name
//     ORDER BY total_cost DESC;
//   END;
//   $function$
//

// --- INDEXES ---
// Table: agentes
//   CREATE UNIQUE INDEX agentes_name_key ON public.agentes USING btree (name)
// Table: clipped_cases
//   CREATE UNIQUE INDEX clipped_cases_user_id_jurisprudence_id_key ON public.clipped_cases USING btree (user_id, jurisprudence_id)
// Table: custos
//   CREATE INDEX idx_custos_invocation_id ON public.custos USING btree (invocation_id)
// Table: invocacoes
//   CREATE INDEX idx_invocacoes_created_at ON public.invocacoes USING btree (created_at DESC)
