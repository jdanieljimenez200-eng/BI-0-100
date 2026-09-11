import { Entity, PrimaryColumn, Column, CreateDateColumn } from 'typeorm';

// Registro de eventos de Stripe ya procesados — garantiza idempotencia del
// webhook. Stripe entrega *at-least-once* y sin orden garantizado: la PK
// (event.id) descarta reentregas, y `event_created` permite ignorar eventos
// de suscripción que llegan tarde/desordenados (ver billing.ts).
@Entity('stripe_event')
export class StripeEvent {
  // event.id de Stripe (ej. "evt_1Nxxxx") — único y estable por evento.
  @PrimaryColumn()
  event_id!: string;

  @Column()
  event_type!: string;

  // Unix timestamp (segundos) del evento en Stripe.
  @Column({ type: 'bigint' })
  event_created!: number;

  @CreateDateColumn()
  procesado_en!: Date;
}
