import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components';
import type { JSX } from 'react';

export interface EmailRequestGuestProps {
  readonly locale: 'fr' | 'en';
  readonly guestFirstName: string;
  readonly hotelName: string;
  readonly checkIn: string;
  readonly checkOut: string;
  readonly requestRef: string;
}

const colors = {
  fg: '#111111',
  muted: '#555555',
  border: '#e5e5e5',
  bg: '#ffffff',
} as const;

const body = {
  backgroundColor: colors.bg,
  color: colors.fg,
  fontFamily: 'Inter,system-ui,sans-serif',
};
const container = { maxWidth: 560, margin: '0 auto', padding: 24 };
const heading = { fontSize: 20, marginBottom: 16, color: colors.fg };
const para = { fontSize: 14, lineHeight: '1.6', color: colors.fg, marginBottom: 12 };
const refBox = {
  border: `1px solid ${colors.border}`,
  borderRadius: 6,
  padding: 12,
  fontFamily: 'ui-monospace,SFMono-Regular,monospace',
  fontSize: 13,
  letterSpacing: 1,
  marginTop: 8,
  color: colors.fg,
};
const footer = { fontSize: 12, color: colors.muted, marginTop: 24 };

const copy = {
  fr: {
    preview: 'Votre demande de réservation a bien été reçue.',
    title: 'Demande reçue',
    hello: (n: string) => `Bonjour ${n},`,
    body: (h: string, ci: string, co: string) =>
      `Merci pour votre demande concernant ${h}. Nous avons bien reçu votre demande pour le ${ci} → ${co}.`,
    sla: 'Notre conciergerie vous contactera sous un jour ouvré avec une proposition tarifaire pour cet hôtel hors-réseau.',
    refLabel: 'Référence :',
    sign: '— ConciergeTravel',
  },
  en: {
    preview: 'We received your booking enquiry.',
    title: 'Enquiry received',
    hello: (n: string) => `Hello ${n},`,
    body: (h: string, ci: string, co: string) =>
      `Thank you for reaching out about ${h}. We have received your enquiry for ${ci} → ${co}.`,
    sla: 'Our concierge team will contact you within one business day with availability and pricing for this off-network property.',
    refLabel: 'Reference:',
    sign: '— ConciergeTravel',
  },
} as const;

export default function EmailRequestGuest(props: EmailRequestGuestProps): JSX.Element {
  const c = copy[props.locale];
  return (
    <Html lang={props.locale}>
      <Head />
      <Preview>{c.preview}</Preview>
      <Body style={body}>
        <Container style={container}>
          <Heading as="h1" style={heading}>
            {c.title}
          </Heading>
          <Text style={para}>{c.hello(props.guestFirstName)}</Text>
          <Text style={para}>{c.body(props.hotelName, props.checkIn, props.checkOut)}</Text>
          <Text style={para}>{c.sla}</Text>
          <Section style={refBox}>
            {c.refLabel} <strong>{props.requestRef}</strong>
          </Section>
          <Text style={footer}>{c.sign}</Text>
        </Container>
      </Body>
    </Html>
  );
}
