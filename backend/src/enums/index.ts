/**
 * Core TypeScript Enums
 * Provides type safety for all domain concepts (plans, analysis states, roles, modules)
 */

export enum PlanType {
  FREEMIUM = 'freemium',
  PRO = 'pro',
  PRO_PLUS = 'pro_plus',
  BUSINESS = 'business',
  ENTERPRISE = 'enterprise',
}

export enum AnalysisStatus {
  PENDIENTE = 'pendiente',
  PROCESANDO = 'procesando',
  COMPLETADO = 'completado',
  ERROR = 'error',
}

export enum AccountRole {
  OWNER = 'owner',
  TRABAJADOR = 'trabajador',
}

export enum AnalysisModule {
  MERCADO = 'mercado',
  MARKETING = 'marketing',
  FINANZAS = 'finanzas',
  LEGAL = 'legal',
  BRIEF = 'brief',
}