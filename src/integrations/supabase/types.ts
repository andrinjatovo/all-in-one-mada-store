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
      addresses: {
        Row: {
          city: string | null
          created_at: string
          details: string | null
          district: string | null
          formatted_address: string | null
          full_name: string
          id: string
          is_default: boolean
          latitude: number
          longitude: number
          phone: string
          province: string
          quartier: string
          region: string | null
          street: string
          updated_at: string
          user_id: string
        }
        Insert: {
          city?: string | null
          created_at?: string
          details?: string | null
          district?: string | null
          formatted_address?: string | null
          full_name: string
          id?: string
          is_default?: boolean
          latitude: number
          longitude: number
          phone: string
          province: string
          quartier: string
          region?: string | null
          street: string
          updated_at?: string
          user_id: string
        }
        Update: {
          city?: string | null
          created_at?: string
          details?: string | null
          district?: string | null
          formatted_address?: string | null
          full_name?: string
          id?: string
          is_default?: boolean
          latitude?: number
          longitude?: number
          phone?: string
          province?: string
          quartier?: string
          region?: string | null
          street?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          auto_release_days: number
          commission_rate: number
          id: number
          min_shop_age_months: number
          min_stock_per_item: number
          updated_at: string
          usdt_rate_mga: number
          usdt_rate_updated_at: string
        }
        Insert: {
          auto_release_days?: number
          commission_rate?: number
          id?: number
          min_shop_age_months?: number
          min_stock_per_item?: number
          updated_at?: string
          usdt_rate_mga?: number
          usdt_rate_updated_at?: string
        }
        Update: {
          auto_release_days?: number
          commission_rate?: number
          id?: number
          min_shop_age_months?: number
          min_stock_per_item?: number
          updated_at?: string
          usdt_rate_mga?: number
          usdt_rate_updated_at?: string
        }
        Relationships: []
      }
      app_user_connections: {
        Row: {
          connection_key_ciphertext: string
          connector_id: string
          created_at: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          connection_key_ciphertext: string
          connector_id: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          connection_key_ciphertext?: string
          connector_id?: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          created_at: string
          icon: string | null
          id: string
          name: string
          slug: string
        }
        Insert: {
          created_at?: string
          icon?: string | null
          id?: string
          name: string
          slug: string
        }
        Update: {
          created_at?: string
          icon?: string | null
          id?: string
          name?: string
          slug?: string
        }
        Relationships: []
      }
      client_profiles: {
        Row: {
          address: string | null
          created_at: string
          full_name: string
          id: string
          phone: string | null
          photo_url: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          full_name: string
          id: string
          phone?: string | null
          photo_url?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          full_name?: string
          id?: string
          phone?: string | null
          photo_url?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      conversations: {
        Row: {
          client_id: string
          created_at: string
          id: string
          last_message_at: string
          vendor_id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          last_message_at?: string
          vendor_id: string
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          last_message_at?: string
          vendor_id?: string
        }
        Relationships: []
      }
      coupons: {
        Row: {
          category_id: string | null
          code: string
          created_at: string
          expires_at: string
          id: string
          percent: number
          product_id: string | null
          reason: string | null
          used_at: string | null
          user_id: string
        }
        Insert: {
          category_id?: string | null
          code: string
          created_at?: string
          expires_at?: string
          id?: string
          percent?: number
          product_id?: string | null
          reason?: string | null
          used_at?: string | null
          user_id: string
        }
        Update: {
          category_id?: string | null
          code?: string
          created_at?: string
          expires_at?: string
          id?: string
          percent?: number
          product_id?: string | null
          reason?: string | null
          used_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      deposits: {
        Row: {
          admin_note: string | null
          amount_mga: number
          created_at: string
          id: string
          method: string
          proof_url: string
          reference: string | null
          reviewed_at: string | null
          status: Database["public"]["Enums"]["deposit_status"]
          user_id: string
        }
        Insert: {
          admin_note?: string | null
          amount_mga: number
          created_at?: string
          id?: string
          method: string
          proof_url: string
          reference?: string | null
          reviewed_at?: string | null
          status?: Database["public"]["Enums"]["deposit_status"]
          user_id: string
        }
        Update: {
          admin_note?: string | null
          amount_mga?: number
          created_at?: string
          id?: string
          method?: string
          proof_url?: string
          reference?: string | null
          reviewed_at?: string | null
          status?: Database["public"]["Enums"]["deposit_status"]
          user_id?: string
        }
        Relationships: []
      }
      exchange_rate_history: {
        Row: {
          changed_by: string | null
          created_at: string
          currency: string
          id: string
          rate_mga: number
        }
        Insert: {
          changed_by?: string | null
          created_at?: string
          currency?: string
          id?: string
          rate_mga: number
        }
        Update: {
          changed_by?: string | null
          created_at?: string
          currency?: string
          id?: string
          rate_mga?: number
        }
        Relationships: []
      }
      legal_acceptances: {
        Row: {
          accepted_at: string
          doc_key: string
          id: string
          user_id: string
          version: string
        }
        Insert: {
          accepted_at?: string
          doc_key: string
          id?: string
          user_id: string
          version: string
        }
        Update: {
          accepted_at?: string
          doc_key?: string
          id?: string
          user_id?: string
          version?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          content: string | null
          conversation_id: string
          created_at: string
          id: string
          image_url: string | null
          sender_id: string
        }
        Insert: {
          content?: string | null
          conversation_id: string
          created_at?: string
          id?: string
          image_url?: string | null
          sender_id: string
        }
        Update: {
          content?: string | null
          conversation_id?: string
          created_at?: string
          id?: string
          image_url?: string | null
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          is_read: boolean
          link: string | null
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          link?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          link?: string | null
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      order_events: {
        Row: {
          actor_id: string | null
          created_at: string
          field: string
          id: string
          new_value: string | null
          old_value: string | null
          order_id: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          field: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          order_id: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          field?: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          address_id: string | null
          auto_release_at: string | null
          buyer_confirmed_at: string | null
          client_hidden: boolean
          client_id: string
          commission_mga: number
          coop_name: string | null
          coupon_percent: number | null
          courier_name: string | null
          created_at: string
          delivered_at: string | null
          delivery_days_max: number | null
          delivery_days_min: number | null
          delivery_fee_mga: number
          delivery_km: number | null
          depart_at: string | null
          depart_city: string | null
          eta_at: string | null
          id: string
          in_transit_at: string | null
          negotiated_offer_id: string | null
          normal_unit_price_mga: number | null
          payment_method: string
          product_id: string
          product_image: string | null
          product_title: string
          quantity: number
          released_at: string | null
          shipped_at: string | null
          shipping_address: string | null
          shipping_mode: string | null
          status: Database["public"]["Enums"]["order_status"]
          total_mga: number
          tracking_code: string | null
          tracking_status: string
          unit_price_mga: number
          updated_at: string
          variant_label: string | null
          vendor_acceptance: string
          vendor_amount_mga: number
          vendor_decided_at: string | null
          vendor_id: string
          vendor_refusal_reason: string | null
          vendor_released: boolean
        }
        Insert: {
          address_id?: string | null
          auto_release_at?: string | null
          buyer_confirmed_at?: string | null
          client_hidden?: boolean
          client_id: string
          commission_mga?: number
          coop_name?: string | null
          coupon_percent?: number | null
          courier_name?: string | null
          created_at?: string
          delivered_at?: string | null
          delivery_days_max?: number | null
          delivery_days_min?: number | null
          delivery_fee_mga?: number
          delivery_km?: number | null
          depart_at?: string | null
          depart_city?: string | null
          eta_at?: string | null
          id?: string
          in_transit_at?: string | null
          negotiated_offer_id?: string | null
          normal_unit_price_mga?: number | null
          payment_method?: string
          product_id: string
          product_image?: string | null
          product_title: string
          quantity: number
          released_at?: string | null
          shipped_at?: string | null
          shipping_address?: string | null
          shipping_mode?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          total_mga: number
          tracking_code?: string | null
          tracking_status?: string
          unit_price_mga: number
          updated_at?: string
          variant_label?: string | null
          vendor_acceptance?: string
          vendor_amount_mga?: number
          vendor_decided_at?: string | null
          vendor_id: string
          vendor_refusal_reason?: string | null
          vendor_released?: boolean
        }
        Update: {
          address_id?: string | null
          auto_release_at?: string | null
          buyer_confirmed_at?: string | null
          client_hidden?: boolean
          client_id?: string
          commission_mga?: number
          coop_name?: string | null
          coupon_percent?: number | null
          courier_name?: string | null
          created_at?: string
          delivered_at?: string | null
          delivery_days_max?: number | null
          delivery_days_min?: number | null
          delivery_fee_mga?: number
          delivery_km?: number | null
          depart_at?: string | null
          depart_city?: string | null
          eta_at?: string | null
          id?: string
          in_transit_at?: string | null
          negotiated_offer_id?: string | null
          normal_unit_price_mga?: number | null
          payment_method?: string
          product_id?: string
          product_image?: string | null
          product_title?: string
          quantity?: number
          released_at?: string | null
          shipped_at?: string | null
          shipping_address?: string | null
          shipping_mode?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          total_mga?: number
          tracking_code?: string | null
          tracking_status?: string
          unit_price_mga?: number
          updated_at?: string
          variant_label?: string | null
          vendor_acceptance?: string
          vendor_amount_mga?: number
          vendor_decided_at?: string | null
          vendor_id?: string
          vendor_refusal_reason?: string | null
          vendor_released?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "orders_address_id_fkey"
            columns: ["address_id"]
            isOneToOne: false
            referencedRelation: "addresses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendor_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      price_offers: {
        Row: {
          client_id: string
          color: string | null
          conversation_id: string
          created_at: string
          expires_at: string | null
          id: string
          order_id: string | null
          parent_id: string | null
          product_id: string
          proposed_by: string
          public_unit_price_mga: number
          quantity: number
          size: string | null
          status: string
          unit: string | null
          unit_price_mga: number
          updated_at: string
          vendor_id: string
        }
        Insert: {
          client_id: string
          color?: string | null
          conversation_id: string
          created_at?: string
          expires_at?: string | null
          id?: string
          order_id?: string | null
          parent_id?: string | null
          product_id: string
          proposed_by: string
          public_unit_price_mga: number
          quantity: number
          size?: string | null
          status?: string
          unit?: string | null
          unit_price_mga: number
          updated_at?: string
          vendor_id: string
        }
        Update: {
          client_id?: string
          color?: string | null
          conversation_id?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          order_id?: string | null
          parent_id?: string | null
          product_id?: string
          proposed_by?: string
          public_unit_price_mga?: number
          quantity?: number
          size?: string | null
          status?: string
          unit?: string | null
          unit_price_mga?: number
          updated_at?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "price_offers_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_offers_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "price_offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_offers_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_comments: {
        Row: {
          author_name: string | null
          content: string
          created_at: string
          id: string
          product_id: string
          user_id: string
        }
        Insert: {
          author_name?: string | null
          content: string
          created_at?: string
          id?: string
          product_id: string
          user_id: string
        }
        Update: {
          author_name?: string | null
          content?: string
          created_at?: string
          id?: string
          product_id?: string
          user_id?: string
        }
        Relationships: []
      }
      product_likes: {
        Row: {
          created_at: string
          id: string
          product_id: string
          reaction: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          product_id: string
          reaction?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string
          reaction?: string
          user_id?: string
        }
        Relationships: []
      }
      product_reviews: {
        Row: {
          content: string
          created_at: string
          id: string
          images: string[]
          is_verified_purchase: boolean
          order_id: string
          product_id: string
          rating: number
          status: string
          updated_at: string
          user_id: string
          vendor_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          images?: string[]
          is_verified_purchase?: boolean
          order_id: string
          product_id: string
          rating: number
          status?: string
          updated_at?: string
          user_id: string
          vendor_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          images?: string[]
          is_verified_purchase?: boolean
          order_id?: string
          product_id?: string
          rating?: number
          status?: string
          updated_at?: string
          user_id?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_reviews_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_reviews_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendor_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          category_id: string | null
          click_count: number
          created_at: string
          description: string | null
          discount_percent: number
          id: string
          images: string[]
          is_active: boolean
          price_mga: number
          price_usdt: number | null
          promo_until: string | null
          rating_avg: number
          rating_count: number
          sold_count: number
          stock: number
          title: string
          unit: string
          updated_at: string
          variants: Json
          vendor_id: string
          video_url: string | null
          view_count: number
        }
        Insert: {
          category_id?: string | null
          click_count?: number
          created_at?: string
          description?: string | null
          discount_percent?: number
          id?: string
          images?: string[]
          is_active?: boolean
          price_mga: number
          price_usdt?: number | null
          promo_until?: string | null
          rating_avg?: number
          rating_count?: number
          sold_count?: number
          stock?: number
          title: string
          unit?: string
          updated_at?: string
          variants?: Json
          vendor_id: string
          video_url?: string | null
          view_count?: number
        }
        Update: {
          category_id?: string | null
          click_count?: number
          created_at?: string
          description?: string | null
          discount_percent?: number
          id?: string
          images?: string[]
          is_active?: boolean
          price_mga?: number
          price_usdt?: number | null
          promo_until?: string | null
          rating_avg?: number
          rating_count?: number
          sold_count?: number
          stock?: number
          title?: string
          unit?: string
          updated_at?: string
          variants?: Json
          vendor_id?: string
          video_url?: string | null
          view_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      review_reports: {
        Row: {
          created_at: string
          id: string
          reason: string
          reporter_id: string
          review_id: string
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          reason: string
          reporter_id: string
          review_id: string
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          reason?: string
          reporter_id?: string
          review_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_reports_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "product_reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          is_admin: boolean
          sender_id: string
          ticket_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          is_admin?: boolean
          sender_id: string
          ticket_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          is_admin?: boolean
          sender_id?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      tickets: {
        Row: {
          category: string
          created_at: string
          id: string
          status: Database["public"]["Enums"]["ticket_status"]
          subject: string
          updated_at: string
          user_id: string
        }
        Insert: {
          category: string
          created_at?: string
          id?: string
          status?: Database["public"]["Enums"]["ticket_status"]
          subject: string
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          status?: Database["public"]["Enums"]["ticket_status"]
          subject?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_events: {
        Row: {
          category_id: string | null
          created_at: string
          dwell_ms: number
          event_type: string
          id: string
          price_mga: number | null
          product_id: string | null
          query: string | null
          user_id: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          dwell_ms?: number
          event_type: string
          id?: string
          price_mga?: number | null
          product_id?: string | null
          query?: string | null
          user_id: string
        }
        Update: {
          category_id?: string | null
          created_at?: string
          dwell_ms?: number
          event_type?: string
          id?: string
          price_mga?: number | null
          product_id?: string | null
          query?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      vendor_application_events: {
        Row: {
          action: string
          actor_id: string | null
          application_id: string
          created_at: string
          id: string
          note: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          application_id: string
          created_at?: string
          id?: string
          note?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          application_id?: string
          created_at?: string
          id?: string
          note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vendor_application_events_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "vendor_applications"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_applications: {
        Row: {
          correction_request: string | null
          created_at: string
          data: Json
          decision_reason: string | null
          exception_allowed: boolean
          form_version: string
          id: string
          ref: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          submitted_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          correction_request?: string | null
          created_at?: string
          data?: Json
          decision_reason?: string | null
          exception_allowed?: boolean
          form_version?: string
          id?: string
          ref?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          correction_request?: string | null
          created_at?: string
          data?: Json
          decision_reason?: string | null
          exception_allowed?: boolean
          form_version?: string
          id?: string
          ref?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      vendor_doc_access_log: {
        Row: {
          admin_id: string
          application_id: string
          created_at: string
          id: string
          path: string
        }
        Insert: {
          admin_id: string
          application_id: string
          created_at?: string
          id?: string
          path: string
        }
        Update: {
          admin_id?: string
          application_id?: string
          created_at?: string
          id?: string
          path?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_doc_access_log_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "vendor_applications"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_profiles: {
        Row: {
          address: string | null
          banner_url: string | null
          created_at: string
          description: string | null
          id: string
          logo_url: string | null
          phone: string
          pickup_city: string | null
          pickup_lat: number | null
          pickup_lng: number | null
          pickup_province: string | null
          pickup_quartier: string | null
          pickup_region: string | null
          pickup_street: string | null
          rating_avg: number
          rating_count: number
          shipping_base_mga: number
          shipping_per_km_mga: number
          shipping_zones: Json
          shop_name: string
          status: Database["public"]["Enums"]["vendor_status"]
          updated_at: string
        }
        Insert: {
          address?: string | null
          banner_url?: string | null
          created_at?: string
          description?: string | null
          id: string
          logo_url?: string | null
          phone: string
          pickup_city?: string | null
          pickup_lat?: number | null
          pickup_lng?: number | null
          pickup_province?: string | null
          pickup_quartier?: string | null
          pickup_region?: string | null
          pickup_street?: string | null
          rating_avg?: number
          rating_count?: number
          shipping_base_mga?: number
          shipping_per_km_mga?: number
          shipping_zones?: Json
          shop_name: string
          status?: Database["public"]["Enums"]["vendor_status"]
          updated_at?: string
        }
        Update: {
          address?: string | null
          banner_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          logo_url?: string | null
          phone?: string
          pickup_city?: string | null
          pickup_lat?: number | null
          pickup_lng?: number | null
          pickup_province?: string | null
          pickup_quartier?: string | null
          pickup_region?: string | null
          pickup_street?: string | null
          rating_avg?: number
          rating_count?: number
          shipping_base_mga?: number
          shipping_per_km_mga?: number
          shipping_zones?: Json
          shop_name?: string
          status?: Database["public"]["Enums"]["vendor_status"]
          updated_at?: string
        }
        Relationships: []
      }
      wallet_transactions: {
        Row: {
          amount_mga: number
          created_at: string
          description: string | null
          id: string
          reference_id: string | null
          type: Database["public"]["Enums"]["tx_type"]
          user_id: string
        }
        Insert: {
          amount_mga: number
          created_at?: string
          description?: string | null
          id?: string
          reference_id?: string | null
          type: Database["public"]["Enums"]["tx_type"]
          user_id: string
        }
        Update: {
          amount_mga?: number
          created_at?: string
          description?: string | null
          id?: string
          reference_id?: string | null
          type?: Database["public"]["Enums"]["tx_type"]
          user_id?: string
        }
        Relationships: []
      }
      wallets: {
        Row: {
          balance_admin_funds_mga: number
          balance_commission_mga: number
          balance_mga: number
          balance_pending_mga: number
          balance_spent_mga: number
          updated_at: string
          user_id: string
        }
        Insert: {
          balance_admin_funds_mga?: number
          balance_commission_mga?: number
          balance_mga?: number
          balance_pending_mga?: number
          balance_spent_mga?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          balance_admin_funds_mga?: number
          balance_commission_mga?: number
          balance_mga?: number
          balance_pending_mga?: number
          balance_spent_mga?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      withdrawals: {
        Row: {
          account_holder: string | null
          account_number: string
          admin_note: string | null
          amount_mga: number
          created_at: string
          id: string
          method: string
          reference: string | null
          reviewed_at: string | null
          status: Database["public"]["Enums"]["deposit_status"]
          user_id: string
        }
        Insert: {
          account_holder?: string | null
          account_number: string
          admin_note?: string | null
          amount_mga: number
          created_at?: string
          id?: string
          method: string
          reference?: string | null
          reviewed_at?: string | null
          status?: Database["public"]["Enums"]["deposit_status"]
          user_id: string
        }
        Update: {
          account_holder?: string | null
          account_number?: string
          admin_note?: string | null
          amount_mga?: number
          created_at?: string
          id?: string
          method?: string
          reference?: string | null
          reviewed_at?: string | null
          status?: Database["public"]["Enums"]["deposit_status"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _release_order: {
        Args: { _order_id: string; _reason: string }
        Returns: undefined
      }
      admin_release_order: {
        Args: { _note?: string; _order_id: string }
        Returns: undefined
      }
      admin_review_vendor_application: {
        Args: {
          _action: string
          _allow_exception?: boolean
          _id: string
          _note: string
        }
        Returns: undefined
      }
      admin_send_to_client: {
        Args: { _amount: number; _client_id: string; _note?: string }
        Returns: undefined
      }
      admin_transfer_funds: {
        Args: { _amount: number; _direction: string }
        Returns: undefined
      }
      admin_update_vendor_settings: {
        Args: {
          _commission: number
          _min_age: number
          _min_stock: number
          _usdt: number
        }
        Returns: undefined
      }
      admin_validate_deposit: {
        Args: { _approve: boolean; _deposit_id: string; _note?: string }
        Returns: undefined
      }
      admin_validate_withdrawal: {
        Args: { _approve: boolean; _id: string; _note?: string }
        Returns: undefined
      }
      auto_release_orders: { Args: never; Returns: number }
      compute_shipping_quote: {
        Args: { _lat: number; _lng: number; _vendor_id: string }
        Returns: Json
      }
      confirm_delivery: { Args: { _order_id: string }; Returns: undefined }
      feed_products: {
        Args: {
          _category?: string
          _limit?: number
          _max_price?: number
          _min_price?: number
          _offset?: number
          _q?: string
          _tab?: string
        }
        Returns: {
          category_id: string
          click_count: number
          created_at: string
          discount_percent: number
          final_price_mga: number
          id: string
          images: string[]
          price_mga: number
          promo_until: string
          score: number
          sold_count: number
          title: string
          view_count: number
        }[]
      }
      get_order_invoice: { Args: { _order_id: string }; Returns: Json }
      grant_loyalty_coupons: { Args: never; Returns: number }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      haversine_km: {
        Args: { lat1: number; lat2: number; lng1: number; lng2: number }
        Returns: number
      }
      hide_old_client_orders: { Args: never; Returns: number }
      increment_product_click: {
        Args: { _product_id: string }
        Returns: undefined
      }
      increment_product_view: {
        Args: { _product_id: string }
        Returns: undefined
      }
      pay_price_offer: {
        Args: {
          _address: string
          _address_id?: string
          _delivery_days_max?: number
          _delivery_days_min?: number
          _delivery_fee?: number
          _delivery_km?: number
          _offer_id: string
        }
        Returns: string
      }
      place_order:
        | {
            Args: { _address: string; _product_id: string; _quantity: number }
            Returns: string
          }
        | {
            Args: {
              _address: string
              _address_id?: string
              _delivery_days_max?: number
              _delivery_days_min?: number
              _delivery_fee?: number
              _delivery_km?: number
              _product_id: string
              _quantity: number
            }
            Returns: string
          }
      place_order_v3: {
        Args: {
          _address: string
          _address_id?: string
          _coupon_id?: string
          _delivery_days_max?: number
          _delivery_days_min?: number
          _delivery_fee?: number
          _delivery_km?: number
          _product_id: string
          _quantity: number
        }
        Returns: string
      }
      propose_price_offer: {
        Args: {
          _color?: string
          _conversation_id: string
          _product_id: string
          _quantity: number
          _size?: string
          _unit?: string
          _unit_price: number
        }
        Returns: string
      }
      request_withdrawal: {
        Args: {
          _account: string
          _amount: number
          _holder?: string
          _method: string
        }
        Returns: string
      }
      respond_price_offer: {
        Args: { _action: string; _counter_price?: number; _offer_id: string }
        Returns: string
      }
      submit_vendor_application: { Args: never; Returns: string }
      track_event: {
        Args: {
          _dwell_ms?: number
          _event_type: string
          _product_id?: string
          _query?: string
        }
        Returns: undefined
      }
      vendor_decide_order: {
        Args: { _accept: boolean; _order_id: string; _reason?: string }
        Returns: undefined
      }
      vendor_mark_in_transit: {
        Args: { _order_id: string }
        Returns: undefined
      }
      vendor_set_promo: {
        Args: { _percent: number; _product_id: string; _until?: string }
        Returns: undefined
      }
      vendor_set_tracking: {
        Args: {
          _courier?: string
          _depart_at?: string
          _depart_city?: string
          _eta_at?: string
          _order_id: string
          _status: string
        }
        Returns: undefined
      }
      vendor_ship_order: {
        Args: {
          _coop: string
          _courier: string
          _days_max: number
          _days_min: number
          _depart_at: string
          _depart_city: string
          _mode: string
          _order_id: string
        }
        Returns: undefined
      }
      vendor_update_delivery: {
        Args: {
          _address?: string
          _coop?: string
          _courier?: string
          _days_max?: number
          _days_min?: number
          _depart_at?: string
          _depart_city?: string
          _fee?: number
          _mode?: string
          _order_id: string
        }
        Returns: undefined
      }
      vendor_update_shipping: {
        Args: {
          _coop?: string
          _courier?: string
          _days_max: number
          _days_min: number
          _depart_at: string
          _depart_city?: string
          _mode?: string
          _order_id: string
        }
        Returns: undefined
      }
      vendor_zone_fee: {
        Args: { _address_id: string; _vendor_id: string }
        Returns: Json
      }
    }
    Enums: {
      app_role: "admin" | "vendeur" | "client"
      deposit_status: "en_attente" | "valide" | "rejete"
      order_status:
        | "en_attente"
        | "paye"
        | "expedie"
        | "livre"
        | "annule"
        | "rembourse"
      ticket_status: "ouvert" | "en_cours" | "resolu" | "ferme"
      tx_type:
        | "depot"
        | "achat"
        | "vente"
        | "remboursement"
        | "commission"
        | "vendor_pending"
        | "vendor_release"
        | "retrait"
        | "retrait_refus"
        | "transfert_admin"
        | "envoi_admin"
      vendor_status: "en_attente" | "actif" | "rejete" | "suspendu"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "vendeur", "client"],
      deposit_status: ["en_attente", "valide", "rejete"],
      order_status: [
        "en_attente",
        "paye",
        "expedie",
        "livre",
        "annule",
        "rembourse",
      ],
      ticket_status: ["ouvert", "en_cours", "resolu", "ferme"],
      tx_type: [
        "depot",
        "achat",
        "vente",
        "remboursement",
        "commission",
        "vendor_pending",
        "vendor_release",
        "retrait",
        "retrait_refus",
        "transfert_admin",
        "envoi_admin",
      ],
      vendor_status: ["en_attente", "actif", "rejete", "suspendu"],
    },
  },
} as const
