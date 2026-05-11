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

export interface BookingConfirmationGuestProps {
  readonly locale: 'fr' | 'en';
  readonly guestFirstName: string;
  readonly hotelName: string;
  readonly hotelLocation: string;
  readonly checkIn: string;
  readonly checkOut: string;
  readonly totalLabel: string;
  readonly bookingRef: string;
  readonly cancellationPolicyText: string;
}

const colors = {
  fg: '#111111',
  muted: '#555555',
  border: '#e5e5e5',
  bg: '#ffffff',
  emphasis: '#1a1a1a',
} as const;

const body = {
  backgroundColor: colors.bg,
  color: colors.fg,
  fontFamily: 'Inter,system-ui,sans-serif',
};
const container = { maxWidth: 560, margin: '0 auto', padding: 24 };
const heading = { fontSize: 22, marginBottom: 16, color: colors.fg, fontWeight: 600 as const };
const subHeading = { fontSize: 14, color: colors.muted, marginBottom: 24 };
const para = { fontSize: 14, lineHeight: '1.6', color: colors.fg, marginBottom: 12 };
const box = {
  border: `1px solid ${colors.border}`,
  borderRadius: 6,
  padding: 16,
  marginTop: 12,
  marginBottom: 16,
};
const refBox = {
  ...box,
  fontFamily: 'ui-monospace,SFMono-Regular,monospace',
  fontSize: 13,
  letterSpacing: 1,
  textAlign: 'center' as const,
};
const totalBox = {
  ...box,
  textAlign: 'center' as const,
};
const totalLabelStyle = { fontSize: 11, color: colors.muted, textTransform: 'uppercase' as const, letterSpacing: 1 };
const totalValueStyle = { fontSize: 24, fontWeight: 600 as const, color: colors.emphasis, marginTop: 4 };
const policyBox = {
  ...box,
  backgroundColor: '#fafafa',
};
const policyTitle = { fontSize: 12, color: colors.muted, textTransform: 'uppercase' as const, letterSpacing: 1, marginBottom: 8 };
const policyText = { fontSize: 13, color: colors.fg, whiteSpace: 'pre-line' as const, lineHeight: '1.6' };
const footer = { fontSize: 12, color: colors.muted, marginTop: 24 };

const copy = {
  fr: {
    preview: (ref: string) => `Votre réservation est confirmée — ${ref}`,
    title: 'Votre réservation est confirmée',
    subtitle: 'Tous les détails de votre séjour ci-dessous.',
    hello: (n: string) => `Bonjour ${n},`,
    intro: (h: string, loc: string) => `Votre séjour à ${h} (${loc}) est confirmé. Voici les détails :`,
    stayLabel: 'Séjour',
    refLabel: 'Référence de réservation',
    totalLabel: 'Total réglé',
    policyLabel: 'Politique d\'annulation',
    sign: 'À très bientôt,\n— L\'équipe ConciergeTravel',
  },
  en: {
    preview: (ref: string) => `Your booking is confirmed — ${ref}`,
    title: 'Your booking is confirmed',
    subtitle: 'All your stay details below.',
    hello: (n: string) => `Hello ${n},`,
    intro: (h: string, loc: string) => `Your stay at ${h} (${loc}) is confirmed. Here are the details:`,
    stayLabel: 'Stay',
    refLabel: 'Booking reference',
    totalLabel: 'Total charged',
    policyLabel: 'Cancellation policy',
    sign: 'See you soon,\n— The ConciergeTravel team',
  },
} as const;

export default function BookingConfirmationGuest(
  props: BookingConfirmationGuestProps,
): JSX.Element {
  const c = copy[props.locale];
  return (
    <Html lang={props.locale}>
      <Head />
      <Preview>{c.preview(props.bookingRef)}</Preview>
      <Body style={body}>
        <Container style={container}>
          <Heading as="h1" style={heading}>
            {c.title}
          </Heading>
          <Text style={subHeading}>{c.subtitle}</Text>

          <Text style={para}>{c.hello(props.guestFirstName)}</Text>
          <Text style={para}>{c.intro(props.hotelName, props.hotelLocation)}</Text>

          <Section style={box}>
            <Text style={{ ...para, marginBottom: 4, color: colors.muted, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>
              {c.stayLabel}
            </Text>
            <Text style={{ ...para, marginBottom: 0, fontSize: 16, fontWeight: 600 }}>
              {props.checkIn} → {props.checkOut}
            </Text>
          </Section>

          <Section style={totalBox}>
            <Text style={{ ...totalLabelStyle, margin: 0 }}>{c.totalLabel}</Text>
            <Text style={{ ...totalValueStyle, margin: 0 }}>{props.totalLabel}</Text>
          </Section>

          <Section style={refBox}>
            <Text style={{ fontSize: 11, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1, margin: 0, marginBottom: 4 }}>
              {c.refLabel}
            </Text>
            <Text style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>{props.bookingRef}</Text>
          </Section>

          <Section style={policyBox}>
            <Text style={policyTitle}>{c.policyLabel}</Text>
            <Text style={policyText}>{props.cancellationPolicyText}</Text>
          </Section>

          <Text style={{ ...footer, whiteSpace: 'pre-line' }}>{c.sign}</Text>
        </Container>
      </Body>
    </Html>
  );
}
