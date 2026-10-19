// Tipos de la base de datos de Supabase.
//
// Escrito a mano a partir de supabase/schema.sql y supabase/migrations/*.sql con el mismo formato que
// `npx supabase gen types typescript --project-id <id> > lib/database.types.ts`.
// Al regenerarlo, este archivo se sobrescribe por completo: los tipos derivados
// (uniones literales de los `check`, etc.) viven en lib/types.ts.

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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      clubs: {
        Row: {
          created_at: string
          id: string
          nombre: string
          provincia: string | null
          tipo: string
        }
        Insert: {
          created_at?: string
          id?: string
          nombre: string
          provincia?: string | null
          tipo: string
        }
        Update: {
          created_at?: string
          id?: string
          nombre?: string
          provincia?: string | null
          tipo?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          activo: boolean
          apellido: string | null
          club_id: string | null
          created_at: string
          estado_aprobacion: string
          id: string
          nombre: string | null
          nombre_completo: string | null
          rol: string
          updated_at: string
        }
        Insert: {
          activo?: boolean
          apellido?: string | null
          club_id?: string | null
          created_at?: string
          estado_aprobacion?: string
          id: string
          nombre?: string | null
          nombre_completo?: string | null
          rol?: string
          updated_at?: string
        }
        Update: {
          activo?: boolean
          apellido?: string | null
          club_id?: string | null
          created_at?: string
          estado_aprobacion?: string
          id?: string
          nombre?: string | null
          nombre_completo?: string | null
          rol?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      reportes: {
        Row: {
          adultos: number
          adultos_mayores: number
          attended_at: string | null
          brigadista_texto: string | null
          casos_medicos: number
          club_id: string | null
          condiciones_medicas: string[]
          contacto_nombre: string | null
          contacto_telefono: string | null
          created_at: string
          created_by: string | null
          danio_vivienda: string
          discapacitados: number
          ent_agua: boolean
          ent_camping: boolean
          ent_colchonetas: boolean
          ent_kit_alimento: boolean
          ent_kit_higiene: boolean
          ent_lona: boolean
          ent_otros: string[]
          ent_toldas: boolean
          estado: string
          fecha_reporte: string
          foto_path: string | null
          foto_url: string | null
          gatos: number
          id: string
          lat: number
          lng: number
          menores: number
          nec_agua: boolean
          nec_camping: boolean
          nec_colchonetas: boolean
          nec_kit_alimento: boolean
          nec_kit_higiene: boolean
          nec_lona: boolean
          nec_otros: string[]
          nec_toldas: boolean
          observaciones_atencion: string | null
          perros: number
          plus_code: string | null
          prioridad: string
          total_personas: number | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          adultos?: number
          adultos_mayores?: number
          attended_at?: string | null
          brigadista_texto?: string | null
          casos_medicos?: number
          club_id?: string | null
          condiciones_medicas?: string[]
          contacto_nombre?: string | null
          contacto_telefono?: string | null
          created_at?: string
          created_by?: string | null
          danio_vivienda?: string
          discapacitados?: number
          ent_agua?: boolean
          ent_camping?: boolean
          ent_colchonetas?: boolean
          ent_kit_alimento?: boolean
          ent_kit_higiene?: boolean
          ent_lona?: boolean
          ent_otros?: string[]
          ent_toldas?: boolean
          estado?: string
          fecha_reporte?: string
          foto_path?: string | null
          foto_url?: string | null
          gatos?: number
          id?: string
          lat: number
          lng: number
          menores?: number
          nec_agua?: boolean
          nec_camping?: boolean
          nec_colchonetas?: boolean
          nec_kit_alimento?: boolean
          nec_kit_higiene?: boolean
          nec_lona?: boolean
          nec_otros?: string[]
          nec_toldas?: boolean
          observaciones_atencion?: string | null
          perros?: number
          plus_code?: string | null
          prioridad?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          adultos?: number
          adultos_mayores?: number
          attended_at?: string | null
          brigadista_texto?: string | null
          casos_medicos?: number
          club_id?: string | null
          condiciones_medicas?: string[]
          contacto_nombre?: string | null
          contacto_telefono?: string | null
          created_at?: string
          created_by?: string | null
          danio_vivienda?: string
          discapacitados?: number
          ent_agua?: boolean
          ent_camping?: boolean
          ent_colchonetas?: boolean
          ent_kit_alimento?: boolean
          ent_kit_higiene?: boolean
          ent_lona?: boolean
          ent_otros?: string[]
          ent_toldas?: boolean
          estado?: string
          fecha_reporte?: string
          foto_path?: string | null
          foto_url?: string | null
          gatos?: number
          id?: string
          lat?: number
          lng?: number
          menores?: number
          nec_agua?: boolean
          nec_camping?: boolean
          nec_colchonetas?: boolean
          nec_kit_alimento?: boolean
          nec_kit_higiene?: boolean
          nec_lona?: boolean
          nec_otros?: string[]
          nec_toldas?: boolean
          observaciones_atencion?: string | null
          perros?: number
          plus_code?: string | null
          prioridad?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reportes_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reportes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reportes_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      visitas: {
        Row: {
          brigadista_texto: string | null
          created_at: string
          created_by: string | null
          ent_agua: boolean
          ent_camping: boolean
          ent_colchonetas: boolean
          ent_kit_alimento: boolean
          ent_kit_higiene: boolean
          ent_lona: boolean
          ent_otros: string[]
          ent_toldas: boolean
          fecha: string
          id: string
          observaciones: string | null
          reporte_id: string
          visitado_at: string
        }
        Insert: {
          brigadista_texto?: string | null
          created_at?: string
          created_by?: string | null
          ent_agua?: boolean
          ent_camping?: boolean
          ent_colchonetas?: boolean
          ent_kit_alimento?: boolean
          ent_kit_higiene?: boolean
          ent_lona?: boolean
          ent_otros?: string[]
          ent_toldas?: boolean
          fecha?: string
          id?: string
          observaciones?: string | null
          reporte_id: string
          visitado_at?: string
        }
        Update: {
          brigadista_texto?: string | null
          created_at?: string
          created_by?: string | null
          ent_agua?: boolean
          ent_camping?: boolean
          ent_colchonetas?: boolean
          ent_kit_alimento?: boolean
          ent_kit_higiene?: boolean
          ent_lona?: boolean
          ent_otros?: string[]
          ent_toldas?: boolean
          fecha?: string
          id?: string
          observaciones?: string | null
          reporte_id?: string
          visitado_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "visitas_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visitas_reporte_id_fkey"
            columns: ["reporte_id"]
            isOneToOne: false
            referencedRelation: "reportes"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_miembros: {
        Args: never
        Returns: {
          id: string
          nombre: string | null
          apellido: string | null
          nombre_completo: string | null
          club_id: string | null
          rol: string
          activo: boolean
          estado_aprobacion: string
          email: string | null
          email_confirmado: boolean
        }[]
      }
      clubs_publicos: {
        Args: never
        Returns: {
          id: string
          nombre: string
          tipo: string
        }[]
      }
      is_active_member: { Args: never; Returns: boolean }
      is_admin: { Args: never; Returns: boolean }
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
