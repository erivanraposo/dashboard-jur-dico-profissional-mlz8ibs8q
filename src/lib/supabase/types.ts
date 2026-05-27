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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
// Table: clipped_cases
//   id: uuid (not null, default: gen_random_uuid())
//   user_id: uuid (nullable)
//   jurisprudence_id: uuid (nullable)
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
// Table: processes
//   id: uuid (not null, default: gen_random_uuid())
//   case_number: text (not null)
//   client_name: text (not null)
//   area: text (not null)
//   status: text (not null)
//   description: text (nullable)
//   created_at: timestamp with time zone (not null, default: now())

// --- CONSTRAINTS ---
// Table: clipped_cases
//   FOREIGN KEY clipped_cases_jurisprudence_id_fkey: FOREIGN KEY (jurisprudence_id) REFERENCES jurisprudence(id)
//   PRIMARY KEY clipped_cases_pkey: PRIMARY KEY (id)
//   FOREIGN KEY clipped_cases_user_id_fkey: FOREIGN KEY (user_id) REFERENCES auth.users(id)
//   UNIQUE clipped_cases_user_id_jurisprudence_id_key: UNIQUE (user_id, jurisprudence_id)
// Table: jurisprudence
//   PRIMARY KEY jurisprudence_pkey: PRIMARY KEY (id)
// Table: lawyers
//   PRIMARY KEY lawyers_pkey: PRIMARY KEY (id)
// Table: minutes
//   FOREIGN KEY minutes_lawyer_id_fkey: FOREIGN KEY (lawyer_id) REFERENCES lawyers(id)
//   PRIMARY KEY minutes_pkey: PRIMARY KEY (id)
//   FOREIGN KEY minutes_process_id_fkey: FOREIGN KEY (process_id) REFERENCES processes(id)
// Table: processes
//   PRIMARY KEY processes_pkey: PRIMARY KEY (id)

// --- ROW LEVEL SECURITY POLICIES ---
// Table: clipped_cases
//   Policy "authenticated_all_clipped_cases" (ALL, PERMISSIVE) roles={authenticated}
//     USING: (auth.uid() = user_id)
//     WITH CHECK: (auth.uid() = user_id)
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
// Table: processes
//   Policy "authenticated_all_processes" (ALL, PERMISSIVE) roles={authenticated}
//     USING: true
//     WITH CHECK: true

// --- INDEXES ---
// Table: clipped_cases
//   CREATE UNIQUE INDEX clipped_cases_user_id_jurisprudence_id_key ON public.clipped_cases USING btree (user_id, jurisprudence_id)
