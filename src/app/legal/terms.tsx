/**
 * Terms of use. Describes the service as it works today: deals are offered
 * by independent businesses, YOLO Deals takes no payment for them, and
 * merchants list for free. Operator details come from lib/legal. Have a
 * lawyer review it; this is a careful draft, not legal advice.
 */

import { Bullets, LegalPage, P, Section } from '../../ui/LegalPage';
import { LEGAL, legalField } from '../../lib/legal';

export default function TermsScreen() {
  return (
    <LegalPage title="Terms of use">
      <Section n={1} title="About these terms">
        <P>
          These terms govern your use of YOLO Deals, run by {legalField('operator')} (“we”, “us”). By
          signing in or using the service you agree to them and to our privacy policy.
        </P>
      </Section>

      <Section n={2} title="What YOLO Deals is">
        <P>
          YOLO Deals lists offers made by independent local businesses. We are not the seller. The
          business that posts a deal is responsible for honouring it, for the quality of what it
          provides, for its prices and taxes, and for following the law that applies to it.
        </P>
      </Section>

      <Section n={3} title="Who can use it">
        <P>
          You must be 18 or older. Some deals have higher age limits (for example 21+ for alcohol);
          you may need to show photo ID at the business.
        </P>
      </Section>

      <Section n={4} title="Your account">
        <P>
          You sign in with your mobile number (while YOLO Deals is being tested, without a code). Use
          only your own number, give accurate details, and do not use someone else’s account. You are responsible for claims made from
          your account.
        </P>
      </Section>

      <Section n={5} title="Claiming deals">
        <Bullets
          items={[
            'A claim gives you a code to show at the business. Each deal sets its own limits: how many per person, which days and hours, and when it ends.',
            'Deals can sell out or end early. A code is valid only for its deal, at the business named, within the deal’s time.',
            'You pay the business directly. YOLO Deals does not take payment for deals and does not charge customers.',
            'Cancellations and refunds follow the deal’s own policy and are handled by the business. If something goes wrong, contact us through Help and we will take it up with them.',
            'Do not resell codes, claim more than the stated limit, or use automated tools to claim deals.',
          ]}
        />
      </Section>

      <Section n={6} title="For businesses">
        <Bullets
          items={[
            'Listing on YOLO Deals is free.',
            'Your deals must be real, accurate and available as described, with honest original prices and photos that show what is offered.',
            'Honour every valid code shown within the deal’s terms.',
            'Registration details you give for verification must be your own and correct. The YOLO Verified badge can be removed if they turn out not to be.',
            'We review deals before they go live and may reject, pause or remove any deal or business that breaks these terms or the law.',
          ]}
        />
      </Section>

      <Section n={7} title="What you must not do">
        <Bullets
          items={[
            'Post or send anything unlawful, misleading, offensive or infringing.',
            'Interfere with the service, probe it for weaknesses without permission, or scrape it.',
            'Pretend to be someone else or a business you do not represent.',
          ]}
        />
      </Section>

      <Section n={8} title="Content and photos">
        <P>
          You keep the rights to what you upload and let us show it within YOLO Deals. Some deal
          photos are free stock photos from Unsplash, chosen to show the kind of offer; the actual
          product may look different.
        </P>
      </Section>

      <Section n={9} title="Liability">
        <P>
          We provide the service as it is and work to keep it accurate and available, but we do not
          guarantee that every deal will be honoured or that the service will never be interrupted.
          To the extent the law allows, we are not liable for what a business provides or fails to
          provide, or for indirect losses. Nothing here limits rights you have under the Consumer
          Protection Act, 2019.
        </P>
      </Section>

      <Section n={10} title="Suspension and closing your account">
        <P>
          You can delete your account at any time from Profile. We may suspend or close accounts that
          break these terms, after telling you why unless the law or safety prevents it.
        </P>
      </Section>

      <Section n={11} title="Law and disputes">
        <P>
          These terms are governed by the laws of India. Courts in {LEGAL.jurisdiction} have
          jurisdiction, without affecting your right to approach a consumer commission.
        </P>
      </Section>

      <Section n={12} title="Grievances and contact">
        <P>
          Support: {legalField('supportEmail')}. Grievance officer: {legalField('grievanceOfficer')},{' '}
          {legalField('grievanceEmail')}. We acknowledge complaints within 24 hours and resolve them
          within 15 days.
        </P>
      </Section>

      <Section n={13} title="Changes">
        <P>
          We may update these terms and will change the date at the top. If a change matters, we will
          tell you in the app before it applies.
        </P>
      </Section>
    </LegalPage>
  );
}
