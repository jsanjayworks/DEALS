/**
 * Privacy policy. Written to describe what the app actually does with data,
 * so it changes when the app does. Operator details come from lib/legal.
 * Have a lawyer review it; this is a careful draft, not legal advice.
 */

import { Bullets, LegalPage, P, Section } from '../../ui/LegalPage';
import { legalField } from '../../lib/legal';

export default function PrivacyScreen() {
  return (
    <LegalPage title="Privacy policy">
      <Section n={1} title="Who we are">
        <P>
          YOLO Deals shows offers from local businesses near you and lets you claim, book or
          enquire about them. It is run by {legalField('operator')}, {legalField('address')} (“we”,
          “us”). This policy explains what we collect, why, who sees it and the choices you have.
        </P>
      </Section>

      <Section n={2} title="What we collect">
        <Bullets
          items={[
            'Account details: your email address (or mobile number, where phone sign-in is offered), and anything you add to your profile: name, date of birth and a profile picture.',
            'What you do in the app: deals you open, save, claim, book or enquire about, your searches, and the codes you redeem.',
            'Where you browse: the area you choose (for example Koramangala) and the distance you set. We do not read your device’s GPS location.',
            'If you list a business: its name, contact details, address, category, and the registration details you give for verification (such as GSTIN, PAN, Udyam, FSSAI or licence numbers).',
            'Messages you send to support, and reports you file about a deal.',
            'On this device: your session and preferences (area, distance, vehicle, recent searches) are kept in your browser or app storage.',
          ]}
        />
      </Section>

      <Section n={3} title="Why we use it">
        <Bullets
          items={[
            'To run the service: show deals near you, let you claim them, and give the business what it needs to honour your claim.',
            'To personalise it: what you open, save and claim shapes the “Picked for you” row on Home. You can see these interests under Profile.',
            'To check age limits: deals marked 18+ or 21+ are shown only when your date of birth meets them.',
            'To verify businesses and keep listings honest, and to prevent fraud and abuse.',
            'To answer your support requests and send notices about your account and claims.',
            'To meet legal obligations.',
          ]}
        />
        <P>We do not sell your personal data, and we do not show third-party advertising.</P>
      </Section>

      <Section n={4} title="Who sees it">
        <Bullets
          items={[
            'Businesses: when you claim, book or enquire about a deal, that business sees the details of your claim (code, quantity, time slot and any message you write) so it can serve you. Businesses also see counts of views and claims for their own deals, not who viewed them.',
            'Service providers who run parts of YOLO Deals for us, under contract: our database and sign-in provider (Supabase), our email provider for sign-in codes, and our website host (Expo). Your data may be stored on their servers, which can be outside India.',
            'Authorities, when the law requires it.',
          ]}
        />
      </Section>

      <Section n={5} title="How long we keep it">
        <P>
          We keep your account data while your account is open. When you delete your account (Profile
          → Delete account), we remove your profile details, saved deals and open claims and close
          your login. We may keep records of past claims and support messages for as long as the law
          or a pending dispute requires, and then delete them.
        </P>
      </Section>

      <Section n={6} title="Your rights">
        <P>Under the Digital Personal Data Protection Act, 2023, you can:</P>
        <Bullets
          items={[
            'see and correct your details (Profile → Edit profile);',
            'erase your account and data (Profile → Delete account);',
            'withdraw consent by deleting your account; the service cannot run without the data it needs;',
            'nominate someone to exercise these rights for you;',
            'raise a grievance with us, and then with the Data Protection Board of India.',
          ]}
        />
      </Section>

      <Section n={7} title="Age">
        <P>
          YOLO Deals is for people aged 18 and over. We do not knowingly collect data from children.
          If you believe a child has signed up, write to us and we will delete the account.
        </P>
      </Section>

      <Section n={8} title="Security">
        <P>
          Sign-in is by one-time code, so there is no password to steal. Data travels over encrypted
          connections and every database read is checked against who is asking. No system is
          perfectly secure; if a breach affects you, we will tell you and the authorities as the law
          requires.
        </P>
      </Section>

      <Section n={9} title="Changes">
        <P>
          We will update this policy when the app changes how it uses data, and change the date at
          the top. If a change matters, we will tell you in the app before it applies.
        </P>
      </Section>

      <Section n={10} title="Contact and grievances">
        <P>
          Questions: {legalField('supportEmail')}. Grievance officer: {legalField('grievanceOfficer')},{' '}
          {legalField('grievanceEmail')}. We acknowledge grievances within 24 hours and resolve them
          within 15 days.
        </P>
      </Section>
    </LegalPage>
  );
}
