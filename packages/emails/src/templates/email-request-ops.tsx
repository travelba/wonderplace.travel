import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Text,
} from '@react-email/components';
import type { JSX, ReactElement } from 'react';

export interface EmailRequestOpsProps {
  readonly hotelName: string;
  readonly hotelId: string;
  readonly requestRef: string;
  readonly checkIn: string;
  readonly checkOut: string;
  readonly adults: number;
  readonly children: number;
  readonly guestFirstName: string;
  readonly guestLastName: string;
  readonly guestEmail: string;
  readonly guestPhone: string;
  readonly guestNationality?: string;
  readonly roomPreference?: string;
  readonly message?: string;
}

const body = {
  backgroundColor: '#ffffff',
  color: '#111',
  fontFamily: 'ui-monospace,SFMono-Regular,monospace',
};
const container = { maxWidth: 640, margin: '0 auto', padding: 24 };
const heading = { fontSize: 16, marginBottom: 12 };
const tableStyle = { borderCollapse: 'collapse' as const, fontSize: 13 };
const tdLabel = { color: '#555', padding: '6px 12px 6px 0', verticalAlign: 'top' as const };
const tdValue = { padding: '6px 0', verticalAlign: 'top' as const };

function row(label: string, value: string | undefined): ReactElement | null {
  if (value === undefined || value.length === 0) return null;
  return (
    <tr key={label}>
      <td style={tdLabel}>{label}</td>
      <td style={tdValue}>{value}</td>
    </tr>
  );
}

export default function EmailRequestOps(props: EmailRequestOpsProps): JSX.Element {
  const rows: Array<ReactElement | null> = [
    row('Hotel', `${props.hotelName} (id ${props.hotelId})`),
    row('Stay', `${props.checkIn} → ${props.checkOut}`),
    row('Guests', `${props.adults} adults, ${props.children} children`),
    row('Lead guest', `${props.guestFirstName} ${props.guestLastName}`),
    row('Email', props.guestEmail),
    row('Phone', props.guestPhone),
    row('Nationality', props.guestNationality),
    row('Room preference', props.roomPreference),
    row('Message', props.message),
  ];

  return (
    <Html lang="en">
      <Head />
      <Preview>New email-mode booking request — {props.requestRef}</Preview>
      <Body style={body}>
        <Container style={container}>
          <Heading as="h2" style={heading}>
            New email-mode booking request — <strong>{props.requestRef}</strong>
          </Heading>
          <table cellPadding={0} cellSpacing={0} style={tableStyle}>
            <tbody>
              {rows.filter((r): r is ReactElement => r !== null)}
            </tbody>
          </table>
          <Text style={{ fontSize: 12, color: '#555', marginTop: 16 }}>
            Internal — do not forward externally. PII redacted in logs.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
