import { BrandMark } from '../components/BrandMark';

const LEGAL_CONTENT = {
  terms: {
    eyebrow: 'PLATFORM TERMS',
    title: 'Terms of service',
    updated: 'Last updated 11 October 2026',
    intro: 'These terms govern your access to DriveHire and your use of its vehicle-management services. By creating an account or using the service, you agree to these terms.',
    sections: [
      ['1. About the service', 'DriveHire provides tools for vehicle owners, drivers and authorised administrators to maintain vehicle records and, as additional services become available, coordinate mobility services. The features available to you depend on your account and the current release.'],
      ['2. Account eligibility and security', 'You must be legally able to enter into a contract where you live and provide accurate account details. You are responsible for activity carried out using your credentials. Keep your password confidential and notify the platform operator promptly if you suspect unauthorised account access. Accounts are personal and must not be transferred.'],
      ['3. Vehicle information', 'You must have authority to submit each vehicle record and any photographs or other information you upload. Vehicle details must be accurate, current and lawful. You remain responsible for correcting outdated details and maintaining all registrations, licences, permits and insurance required by applicable law.'],
      ['4. Verification and availability', 'A verification label reflects the status recorded by the platform; it is not a government certification, inspection, insurance policy or guarantee of roadworthiness. Availability settings are administrative information and do not independently create a reservation or service commitment.'],
      ['5. Acceptable use', 'Do not use DriveHire to impersonate another person, submit fraudulent records, upload content you do not have rights to use, interfere with the service, bypass access controls, or violate applicable law. We may restrict access where reasonably necessary to investigate abuse, protect users or comply with law.'],
      ['6. Service availability and changes', 'We will take reasonable care to operate the service but do not promise uninterrupted access or error-free records. Features may be updated, suspended or withdrawn for maintenance, safety, legal or operational reasons. We will provide notice where reasonably practicable.'],
      ['7. Data and account closure', 'You retain responsibility for the information you submit. The platform processes account and vehicle information as described in the Privacy Policy. You may request account closure using the support contact published by the platform operator; records may be retained where required by law or needed to resolve disputes.'],
      ['8. Disclaimers and liability', 'DriveHire is provided on an “as available” basis to the extent permitted by law. Nothing in these terms excludes a consumer right or liability that cannot lawfully be excluded. To the extent permitted by law, the platform operator is not responsible for indirect losses arising from your use of the service or from vehicle information supplied by another user.'],
      ['9. Governing law and disputes', 'These terms are governed by the laws of India, subject to mandatory protections applicable in your place of residence. The parties will first try to resolve disputes through good-faith discussion. Any court proceedings will be brought before a competent court in the jurisdiction of the platform operator, subject to applicable law.'],
      ['10. Contact and updates', 'The platform operator’s legal name, registered address and support email must be added before public launch. Material changes to these terms will be posted on this page with a revised effective date. Continued use after a change takes effect means you accept the updated terms.'],
    ],
  },
  privacy: {
    eyebrow: 'DATA & PRIVACY',
    title: 'Privacy policy',
    updated: 'Last updated 11 October 2026',
    intro: 'This policy explains what information DriveHire handles, why it is used and the choices available to you when you use the platform.',
    sections: [
      ['1. Information we collect', 'Account details may include your name, email address, telephone number and account role. Vehicle records may include make, model, year, registration number, passenger capacity, availability, verification status and photographs you choose to upload. We also receive messages and support requests you send.'],
      ['2. How we use information', 'We use information to create and secure accounts, operate vehicle records, provide features requested by you, administer verification workflows, respond to support requests, prevent fraud and meet legal obligations. We do not use account passwords in plain text; authentication credentials are stored as password hashes.'],
      ['3. Legal grounds and choices', 'Where required by law, processing is based on performance of the service you request, compliance with legal obligations, legitimate operational interests or your consent. You may update account information, remove vehicle photographs through available controls, or ask the platform operator to close your account.'],
      ['4. When information is shared', 'Information is accessible to authorised platform personnel for operational and security purposes. Vehicle information may be visible to other users only where a specific product feature makes it necessary and after that feature is enabled. We may disclose information when required by law or to protect users and the service. We do not sell personal information.'],
      ['5. Retention', 'We keep account and vehicle records while an account is active and for a reasonable period afterwards to meet legal requirements, maintain transaction history, prevent fraud and resolve disputes. Removing a vehicle from an active list does not necessarily erase its historical record.'],
      ['6. Security', 'We use access controls and technical safeguards designed to protect information. No internet transmission or storage system can be guaranteed completely secure. Please use a unique password and contact the platform operator promptly if you believe your account is compromised.'],
      ['7. Your rights', 'Depending on the law where you live, you may have rights to access, correct, delete, restrict or receive a copy of your information, or to object to certain processing. You may also withdraw consent where processing relies on consent. Send requests to the platform operator using the contact details published before launch.'],
      ['8. Cookies and device data', 'The current web app uses browser storage to retain your sign-in session. It does not need advertising cookies to provide its core vehicle-management experience. Server logs may record basic technical information needed to maintain service reliability and security.'],
      ['9. Children and international processing', 'DriveHire is intended for adults who can legally use the service; it is not directed to children. Information may be processed in the country where the platform operator or its service providers operate, with appropriate safeguards where required by law.'],
      ['10. Contact and policy updates', 'Before public launch, the platform operator must publish its legal name, privacy contact and registered address. Policy changes will be posted here with a revised effective date. This draft should be reviewed and completed by the platform operator and qualified counsel before launch.'],
    ],
  },
};

export function LegalPage({ type }) {
  const content = LEGAL_CONTENT[type];

  return (
    <main className="legal-page">
      <header className="legal-page__header">
        <BrandMark />
        <a href="/" className="text-button">Return to DriveHire <span aria-hidden="true">↗</span></a>
      </header>
      <article className="legal-document">
        <p className="eyebrow">{content.eyebrow}</p>
        <h1>{content.title}</h1>
        <p className="legal-document__updated">{content.updated}</p>
        <p className="legal-document__intro">{content.intro}</p>
        {content.sections.map(([heading, body]) => (
          <section key={heading}>
            <h2>{heading}</h2>
            <p>{body}</p>
          </section>
        ))}
        <p className="legal-document__notice">
          Draft platform policy. Complete the operator identity and contact details and obtain legal review before public launch.
        </p>
      </article>
      <footer className="legal-page__footer">
        <span>© {new Date().getFullYear()} DriveHire</span>
        <span><a href="/terms">Terms</a><a href="/privacy">Privacy</a></span>
      </footer>
    </main>
  );
}
