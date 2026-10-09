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
            'Account details: your mobile number (or email address, where email sign-in is offered), and anything you add to your profile: name, date of birth and a profile picture.',
            'Your choices: whether you are 18 or older and whether you agreed to personalised suggestions, each recorded with the date, the version of this notice and how you answered (tap or voice).',
            'Orders: the deals you claim, book, buy or enquire about, their codes, and your ratings and reviews.',
            'What you do in the app: deals and shop pages you open, your searches, what you ask the voice assistant, deals you save or say “not for me” to. Without your consent to personalised suggestions this is counted for the businesses’ statistics but not linked to you.',
            'Where you are: the area you choose (for example Koramangala) and the distance you set, or, only when you tap “Use my location”, your device’s location to find deals near you. We do not track your location in the background.',
            'Voice: when you tap the microphone, your browser’s speech service turns what you say into text. We keep the text you asked and what we understood from it, never the recording.',
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
            'To personalise it, only if you agree: what you open, search for, ask, save and book picks deals for you (“Picked for you”, “Best deal for me”). This is off unless you switch it on, needs you to be 18 or older, and can be switched off or cleared any time under Profile → Privacy and data. Switching it off also forgets what was learned.',
            'To understand what you ask by voice: the words go to our server and to our AI provider (Groq or Anthropic), which reads them to work out what you want. Only signed-in people can use it, within a daily limit.',
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
            'Businesses: when you claim, book or enquire about a deal, that business sees your first name and initial (for example “Aarav S.”) and the details of your order (code, quantity, time slot and any message you write) so it can serve you. It does not see your phone number or email. Businesses see counts of views and orders for their own deals, never who viewed them.',
            'Reviews show your first name and initial.',
            'Service providers who run parts of YOLO Deals for us, under contract: our database and sign-in provider (Supabase), the SMS or email provider that sends sign-in codes, our website host (Expo), Groq or Anthropic (to understand voice requests) and your browser’s speech service (Google in Chrome, Microsoft in Edge) when you use the microphone. Your data may be stored or processed on their servers, which can be outside India.',
            'Authorities, when the law requires it.',
          ]}
        />
      </Section>

      <Section n={5} title="How long we keep it">
        <P>
          Activity linked to you (deals opened, searches, voice requests) is kept for 180 days and
          then deleted; after that, counts no longer say who it was. You can clear it sooner under
          Profile → Privacy and data. Your account data is kept while your account is open. When you
          ask to delete your account (Profile → Delete account), your activity is erased at once, and
          we remove your profile details, saved deals and open claims and close your login. We may
          keep records of past orders and support messages for as long as the law or a pending dispute
          requires, and then delete them.
        </P>
      </Section>

      <Section n={6} title="Your rights">
        <P>Under the Digital Personal Data Protection Act, 2023, you can:</P>
        <Bullets
          items={[
            'see and correct your details (Profile → Edit profile), and see what activity is recorded about you (Profile → Privacy and data, or ask the assistant “what do you know about me?”);',
            'withdraw your consent to personalised suggestions with one tap, as easily as you gave it; what was learned is erased;',
            'clear your activity at any time, and erase your account and data (Profile → Delete account);',
            'nominate someone to exercise these rights for you;',
            'raise a grievance with us, and then with the Data Protection Board of India.',
          ]}
        />
      </Section>

      <Section n={7} title="Age">
        <P>
          YOLO Deals is for people aged 18 and over. We never personalise or track the activity of
          anyone who has not told us they are 18 or older, or whose date of birth says they are
          younger. If you believe a child has signed up, write to us and we will delete the account.
        </P>
      </Section>

      <Section n={8} title="Security">
        <P>
          While YOLO Deals is being tested, you sign in with your mobile number alone; before it opens
          to the public, sign-in will need a one-time code sent to that number. Data travels over
          encrypted connections and every database read is checked against who is asking. No system is
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
