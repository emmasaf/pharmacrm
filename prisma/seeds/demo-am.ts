// Armenian pharma demo dataset for local exploration. Run with `pnpm db:seed:demo-am`.
// Kept out of `seed.ts` and out of migrations so it never reaches a deployed database.
// Writes through Prisma directly: no audit log entries and no Inngest events
// (which would otherwise spawn funnel auto-tasks for every demo deal).
// Fixed IDs make re-runs update the same rows instead of duplicating them.
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const id = (group: number, n: number) =>
  `00000000-0000-4000-b${String(group).padStart(3, "0")}-${String(n).padStart(12, "0")}`;
const days = (n: number) => new Date(Date.now() + n * 86_400_000);

const SERIES_ID = "00000000-0000-4000-a000-000000000001";
const VAT_AM_ID = id(0, 1);

async function lookup(
  model: { findFirst: (args: { where: { name: string } }) => Promise<{ id: string } | null> },
  name: string
) {
  const row = await model.findFirst({ where: { name } });
  if (!row) throw new Error(`Lookup "${name}" missing — run \`pnpm db:seed\` first`);
  return row.id;
}

async function main() {
  const admin = await prisma.users.findFirst({ where: { role: "admin" }, orderBy: { created_on: "asc" } });
  if (!admin) throw new Error("No admin user — run `pnpm db:seed` first");

  await prisma.currency.upsert({
    where: { code: "AMD" },
    update: {},
    create: { code: "AMD", name: "Armenian Dram", symbol: "֏" },
  });
  for (const [fromCurrency, toCurrency, rate] of [
    ["USD", "AMD", 387],
    ["AMD", "USD", 0.002584],
    ["EUR", "AMD", 420],
    ["AMD", "EUR", 0.002381],
  ] as const) {
    await prisma.exchangeRate.upsert({
      where: { fromCurrency_toCurrency: { fromCurrency, toCurrency } },
      update: { rate },
      create: { fromCurrency, toCurrency, rate },
    });
  }
  await prisma.invoice_TaxRates.upsert({
    where: { id: VAT_AM_ID },
    update: {},
    create: { id: VAT_AM_ID, name: "Armenia VAT 20%", rate: 20 },
  });

  const industries: Record<string, string> = {};
  for (const name of ["Pharma manufacturing", "Pharmacy chain", "Hospital / clinic", "Pharma distribution", "Testing laboratory"]) {
    const row = (await prisma.crm_Industry_Type.findFirst({ where: { name } })) ?? (await prisma.crm_Industry_Type.create({ data: { name } }));
    industries[name] = row.id;
  }

  const manager = await prisma.users.upsert({
    where: { email: "anahit.manager@pharmacrm.demo" },
    update: {},
    create: { email: "anahit.manager@pharmacrm.demo", name: "Anahit Sargsyan", role: "manager", userStatus: "ACTIVE" },
  });
  const rep = await prisma.users.upsert({
    where: { email: "davit.sales@pharmacrm.demo" },
    update: {},
    create: { email: "davit.sales@pharmacrm.demo", name: "Davit Hakobyan", role: "user", userStatus: "ACTIVE" },
  });

  const accounts = [
    { name: "Arevik Pharm LLC", industry: "Pharma manufacturing", city: "Yerevan", street: "12 Arshakunyats Ave", employees: "180", owner: manager.id },
    { name: "Nairi Lab Solutions", industry: "Testing laboratory", city: "Gyumri", street: "5 Abovyan St", employees: "35", owner: rep.id },
    { name: "Ararat Pharmacy Network", industry: "Pharmacy chain", city: "Yerevan", street: "44 Tigran Mets Ave", employees: "420", owner: rep.id },
    { name: "Sevan Medical Center", industry: "Hospital / clinic", city: "Sevan", street: "3 Nairyan St", employees: "260", owner: manager.id },
    { name: "Hayk MedDistribution CJSC", industry: "Pharma distribution", city: "Yerevan", street: "8 Tbilisyan Hwy", employees: "95", owner: admin.id },
    { name: "Dilijan BioTech", industry: "Pharma manufacturing", city: "Dilijan", street: "21 Myasnikyan St", employees: "70", owner: manager.id },
    { name: "Garni Health Pharmacies", industry: "Pharmacy chain", city: "Abovyan", street: "16 Hanrapetutyan St", employees: "60", owner: rep.id },
    { name: "Vanadzor Clinical Hospital", industry: "Hospital / clinic", city: "Vanadzor", street: "2 Tigran Mets St", employees: "340", owner: admin.id },
  ].map((a, i) => ({ ...a, id: id(1, i + 1) }));

  for (const a of accounts) {
    const data = {
      v: 0,
      name: a.name,
      status: "Active",
      type: "Customer",
      industry: industries[a.industry],
      employees: a.employees,
      billing_street: a.street,
      billing_city: a.city,
      billing_country: "Armenia",
      email: `info@${a.name.split(" ")[0].toLowerCase()}.demo`,
      office_phone: `+374 10 ${String(200000 + (accounts.indexOf(a) + 1) * 11111).slice(0, 6)}`,
      assigned_to: a.owner,
      createdBy: admin.id,
    };
    await prisma.crm_Accounts.upsert({ where: { id: a.id }, update: data, create: { id: a.id, ...data } });
  }
  const acc = (i: number) => accounts[i - 1];

  const customerType = await lookup(prisma.crm_Contact_Types, "Customer");
  const contacts = [
    [1, "Armen", "Grigoryan", "Quality Assurance Director"],
    [1, "Lilit", "Avetisyan", "Head of Procurement"],
    [2, "Tigran", "Petrosyan", "Laboratory Manager"],
    [2, "Mariam", "Harutyunyan", "Microbiologist"],
    [3, "Karen", "Mkrtchyan", "Chief Executive Officer"],
    [3, "Ani", "Vardanyan", "Head Pharmacist"],
    [4, "Gevorg", "Sahakyan", "Medical Director"],
    [4, "Narine", "Khachatryan", "Pharmacy Department Head"],
    [5, "Ashot", "Manukyan", "Commercial Director"],
    [5, "Siranush", "Poghosyan", "Warehouse & GDP Manager"],
    [6, "Vahe", "Martirosyan", "Production Manager"],
    [6, "Hasmik", "Karapetyan", "Qualified Person (QP)"],
    [7, "Sargis", "Ghazaryan", "Operations Manager"],
    [7, "Elen", "Abrahamyan", "Pharmacist"],
    [8, "Ruben", "Aleksanyan", "Hospital Director"],
    [8, "Gayane", "Simonyan", "Infection Control Lead"],
  ].map(([account, first_name, last_name, position], i) => ({
    id: id(2, i + 1),
    account: acc(account as number),
    first_name: first_name as string,
    last_name: last_name as string,
    position: position as string,
  }));

  for (const c of contacts) {
    const data = {
      first_name: c.first_name,
      last_name: c.last_name,
      position: c.position,
      email: `${c.first_name}.${c.last_name}`.toLowerCase() + `@${c.account.name.split(" ")[0].toLowerCase()}.demo`,
      mobile_phone: `+374 9${contacts.indexOf(c) % 9} ${String(310000 + contacts.indexOf(c) * 4321)}`,
      accountsIDs: c.account.id,
      contact_type_id: customerType,
      assigned_to: c.account.owner,
      createdBy: admin.id,
    };
    await prisma.crm_Contacts.upsert({ where: { id: c.id }, update: data, create: { id: c.id, ...data } });
  }
  const contactOf = (accountIndex: number) => contacts.find((c) => c.account.id === acc(accountIndex).id)!;

  const leads = [
    ["Hovhannes", "Arakelyan", "Kotayk Pharm", "Owner", "Web", "New", "Asked for a quote on HPLC testing of 40 samples/month."],
    ["Shushan", "Nazaryan", "Erebuni Dental Clinic", "Clinic Manager", "Referral", "Contacted", "Referred by Sevan Medical Center; needs sterilisation validation."],
    ["Levon", "Danielyan", "Masis Generics", "QA Manager", "Event", "Qualified", "Met at Armenian Pharma Forum; preparing for EU GMP inspection."],
    ["Anush", "Sukiasyan", "Goris Family Pharmacy", "Owner", "Cold Call", "New", "Small chain of 3 pharmacies, interested in GDP training."],
    ["Arsen", "Galstyan", "Kapan Regional Hospital", "Procurement Officer", "Email Campaign", "Contacted", "Opened the cleanroom audit campaign email twice."],
    ["Tatevik", "Asatryan", "Lori Herbal LLC", "Founder", "Web", "Lost", "Chose a cheaper local lab; revisit next year."],
  ];
  for (let i = 0; i < leads.length; i++) {
    const [firstName, lastName, company, jobTitle, source, status, description] = leads[i];
    const data = {
      firstName,
      lastName,
      company,
      jobTitle,
      description,
      email: `${firstName}.${lastName}`.toLowerCase() + "@example.am",
      lead_source_id: await lookup(prisma.crm_Lead_Sources, source),
      lead_status_id: await lookup(prisma.crm_Lead_Statuses, status),
      assigned_to: i % 2 ? rep.id : manager.id,
      createdBy: admin.id,
    };
    await prisma.crm_Leads.upsert({ where: { id: id(3, i + 1) }, update: data, create: { id: id(3, i + 1), ...data } });
  }

  const productCategories = ["Laboratory testing", "Audit & consulting", "Training"].map((name, i) => ({ id: id(4, i + 1), name, order: i }));
  for (const c of productCategories) {
    await prisma.crm_ProductCategories.upsert({ where: { id: c.id }, update: { name: c.name }, create: { ...c, createdBy: admin.id } });
  }
  const products = [
    ["GMP compliance audit", "AUD-GMP", "SERVICE", 1_500_000, 2, "audit", false],
    ["Microbiological testing (per sample)", "LAB-MICRO", "SERVICE", 25_000, 1, "sample", false],
    ["HPLC chemical analysis (per sample)", "LAB-HPLC", "SERVICE", 40_000, 1, "sample", false],
    ["Process & cleaning validation", "VAL-PROC", "SERVICE", 2_500_000, 2, "project", false],
    ["GMP/GDP staff training (per day)", "TRN-GMP", "SERVICE", 600_000, 3, "day", false],
    ["QMS consulting retainer", "CON-QMS", "SERVICE", 800_000, 2, "month", true],
  ] as const;
  for (let i = 0; i < products.length; i++) {
    const [name, sku, type, unit_price, category, unit, is_recurring] = products[i];
    const data = {
      name,
      sku: `DEMO-${sku}`,
      type,
      status: "ACTIVE" as const,
      unit_price,
      unit,
      currency: "AMD",
      tax_rate: 20,
      is_recurring,
      billing_period: is_recurring ? ("MONTHLY" as const) : ("ONE_TIME" as const),
      categoryId: productCategories[category - 1].id,
      createdBy: admin.id,
    };
    await prisma.crm_Products.upsert({ where: { id: id(5, i + 1) }, update: data, create: { id: id(5, i + 1), ...data } });
  }

  const newDeal = await lookup(prisma.crm_Opportunities_Type, "New deal");
  const upsale = await lookup(prisma.crm_Opportunities_Type, "Upsale");
  const opportunities = [
    [1, "Annual GMP audit 2027", "Contract negotiation", newDeal, 1_800_000, "AMD", 45, "NONE", "Send revised scope with 2 audit days"],
    [2, "Microbiology testing outsourcing", "Need analysis", newDeal, 9_000_000, "AMD", 60, "APPROVED", "Visit Gyumri lab to assess sample volumes"],
    [3, "GDP training for 40 pharmacists", "Offer sent", newDeal, 2_400_000, "AMD", 20, "NONE", "Follow up on offer by phone"],
    [4, "Cleanroom & sterilisation validation", "New", newDeal, 18_000, "USD", 90, "PENDING", "Waiting for manager approval to qualify"],
    [5, "Cold-chain GDP audit of warehouse", "Signing", upsale, 1_500_000, "AMD", 10, "APPROVED", "Contract with client legal for signature"],
    [6, "EU GMP readiness program", "Realization of the project", newDeal, 42_000, "USD", -30, "APPROVED", "Phase 2: process validation on site"],
    [7, "QMS consulting retainer 12 months", "Offer accepted", upsale, 9_600_000, "AMD", 15, "APPROVED", "Draft contract"],
    [8, "Hospital pharmacy audit", "Contract draft", newDeal, 1_200_000, "AMD", 30, "APPROVED", "Agree on audit dates"],
  ] as const;
  for (let i = 0; i < opportunities.length; i++) {
    const [account, name, stage, type, budget, currency, closeInDays, approval_status, next_step] = opportunities[i];
    const a = acc(account);
    const data = {
      name,
      account: a.id,
      contact: contactOf(account).id,
      sales_stage: await lookup(prisma.crm_Opportunities_Sales_Stages, stage),
      type,
      budget,
      expected_revenue: Math.round(budget * 0.8),
      currency,
      close_date: days(closeInDays),
      stage_entered_at: days(-7 - i),
      approval_status,
      approval_requested_at: approval_status === "NONE" ? null : days(-10),
      next_step,
      status: "ACTIVE" as const,
      assigned_to: a.owner,
      createdBy: admin.id,
    };
    const oppId = id(6, i + 1);
    await prisma.crm_Opportunities.upsert({ where: { id: oppId }, update: data, create: { id: oppId, ...data } });
    await prisma.contactsToOpportunities.createMany({
      data: [{ contact_id: contactOf(account).id, opportunity_id: oppId }],
      skipDuplicates: true,
    });
  }

  const contracts = [
    [6, "EU GMP readiness program — framework agreement", 16_000_000, "SIGNED", -60, 305],
    [5, "Cold-chain GDP audit 2026", 1_500_000, "INPROGRESS", 0, 90],
    [1, "Annual GMP audit 2027", 1_800_000, "NOTSTARTED", 30, 395],
  ] as const;
  for (let i = 0; i < contracts.length; i++) {
    const [account, title, value, status, startIn, endIn] = contracts[i];
    const data = {
      v: 0,
      title,
      value,
      status,
      currency: "AMD",
      startDate: days(startIn),
      endDate: days(endIn),
      renewalReminderDate: days(endIn - 30),
      customerSignedDate: status === "SIGNED" ? days(startIn - 5) : null,
      companySignedDate: status === "SIGNED" ? days(startIn - 5) : null,
      account: acc(account).id,
      assigned_to: acc(account).owner,
      createdBy: admin.id,
    };
    await prisma.crm_Contracts.upsert({ where: { id: id(7, i + 1) }, update: data, create: { id: id(7, i + 1), ...data } });
  }

  const activities = [
    ["call", "Intro call with QA director", 1, 1, -21, "completed", "Interested in yearly audit; budget approved in Q4."],
    ["meeting", "On-site visit at Arevik production", 1, 1, -14, "completed", "Toured tablet line; 3 observations to address before audit."],
    ["email", "Sent revised audit scope", 1, 1, -3, "completed", null],
    ["meeting", "Lab capacity assessment in Gyumri", 2, 2, 5, "scheduled", null],
    ["call", "Discussed training dates", 3, 3, -6, "completed", "Prefer two Saturdays in November."],
    ["note", "Pharmacists rotate shifts", 3, 3, -5, "completed", "Training must be split into 2 groups of 20."],
    ["meeting", "Cleanroom walkthrough", 4, 4, 7, "scheduled", null],
    ["call", "Warehouse temperature mapping questions", 5, 5, -9, "completed", "They use data loggers from 2019; recommend recalibration."],
    ["email", "Contract sent for signature", 5, 5, -2, "completed", null],
    ["meeting", "Phase 2 kick-off", 6, 6, -25, "completed", "Validation master plan agreed."],
    ["note", "QP on maternity leave from December", 6, 6, -8, "completed", "Deputy QP: Vahe Martirosyan."],
    ["call", "Retainer scope confirmation", 7, 7, -4, "completed", "Monthly 2 on-site days + remote support."],
    ["meeting", "Audit planning with hospital director", 8, 8, 3, "scheduled", null],
    ["call", "Payment reminder", 3, null, -1, "completed", "Accountant confirmed payment next week."],
    ["note", "Possible referral: Erebuni Dental Clinic", 4, null, -12, "completed", "Gevorg mentioned a dental clinic needing validation."],
  ] as const;
  for (let i = 0; i < activities.length; i++) {
    const [type, title, account, opp, dateIn, status, outcome] = activities[i];
    const activityId = id(8, i + 1);
    const data = { type, title, date: days(dateIn), status, outcome, duration: type === "meeting" ? 60 : 15, createdBy: acc(account).owner };
    await prisma.crm_Activities.upsert({ where: { id: activityId }, update: data, create: { id: activityId, ...data } });
    await prisma.crm_ActivityLinks.deleteMany({ where: { activityId } });
    await prisma.crm_ActivityLinks.createMany({
      data: [
        { activityId, entityType: "account", entityId: acc(account).id },
        { activityId, entityType: "contact", entityId: contactOf(account).id },
        ...(opp ? [{ activityId, entityType: "opportunity", entityId: id(6, opp) }] : []),
      ],
    });
  }

  const invoices = [
    { n: 1, account: 1, status: "PAID", number: "DEMO-2026-0001", issuedIn: -40, lines: [[0, 1, 1_500_000]] },
    { n: 2, account: 3, status: "ISSUED", number: "DEMO-2026-0002", issuedIn: -5, lines: [[4, 2, 600_000]] },
    { n: 3, account: 4, status: "DRAFT", number: null, issuedIn: null, lines: [[1, 12, 25_000], [2, 6, 40_000]] },
  ] as const;
  for (const inv of invoices) {
    const a = acc(inv.account);
    const lines = inv.lines.map(([product, quantity, unitPrice], position) => {
      const lineSubtotal = quantity * unitPrice;
      const lineVat = lineSubtotal * 0.2;
      return {
        id: id(10, inv.n * 10 + position),
        position,
        productId: id(5, product + 1),
        description: products[product][0],
        quantity,
        unitPrice,
        taxRateId: VAT_AM_ID,
        taxRateSnapshot: 20,
        lineSubtotal,
        lineVat,
        lineTotal: lineSubtotal + lineVat,
      };
    });
    const subtotal = lines.reduce((s, l) => s + l.lineSubtotal, 0);
    const vatTotal = lines.reduce((s, l) => s + l.lineVat, 0);
    const grandTotal = subtotal + vatTotal;
    const paidTotal = inv.status === "PAID" ? grandTotal : 0;
    const issued = inv.issuedIn !== null;
    const data = {
      status: inv.status,
      number: inv.number,
      numberOverridden: issued,
      seriesId: SERIES_ID,
      accountId: a.id,
      billingSnapshot: issued ? { name: a.name, street: a.street, city: a.city, zip: null, state: null, country: "Armenia", vat_id: null, registration_id: null } : undefined,
      issueDate: issued ? days(inv.issuedIn) : null,
      taxableSupplyDate: issued ? days(inv.issuedIn) : null,
      dueDate: issued ? days(inv.issuedIn + 14) : null,
      currency: "AMD",
      subtotal,
      vatTotal,
      grandTotal,
      paidTotal,
      balanceDue: grandTotal - paidTotal,
      createdBy: admin.id,
    };
    const invoiceId = id(9, inv.n);
    await prisma.invoices.upsert({ where: { id: invoiceId }, update: data, create: { id: invoiceId, ...data } });
    await prisma.invoice_LineItems.deleteMany({ where: { invoiceId } });
    await prisma.invoice_LineItems.createMany({ data: lines.map((l) => ({ ...l, invoiceId })) });
    await prisma.invoice_Payments.deleteMany({ where: { invoiceId } });
    if (paidTotal) {
      await prisma.invoice_Payments.create({
        data: { invoiceId, paidAt: days(inv.issuedIn! + 10), amount: paidTotal, method: "Bank transfer", reference: "Ameriabank", createdBy: admin.id },
      });
    }
  }

  const boardId = id(11, 1);
  const boardData = {
    v: 0,
    title: "GMP audit — Dilijan BioTech",
    description: "EU GMP readiness program, phase 2 (process validation).",
    user: manager.id,
    visibility: "public",
    createdBy: manager.id,
  };
  await prisma.boards.upsert({ where: { id: boardId }, update: boardData, create: { id: boardId, ...boardData } });
  const sections = ["To do", "In progress", "Done"];
  for (let i = 0; i < sections.length; i++) {
    const title = sections[i];
    await prisma.sections.upsert({
      where: { id: id(12, i + 1) },
      update: { title },
      create: { id: id(12, i + 1), v: 0, board: boardId, title, position: i },
    });
  }
  const tasks = [
    [1, "Collect batch records for last 3 batches", "high", rep.id, 4],
    [1, "Prepare cleaning validation protocol", "normal", manager.id, 10],
    [2, "Temperature mapping of warehouse", "high", rep.id, 2],
    [2, "Review deviation & CAPA log", "normal", manager.id, 6],
    [3, "Validation master plan approved", "normal", manager.id, -20],
    [3, "Kick-off meeting with QP", "low", admin.id, -25],
  ] as const;
  for (let i = 0; i < tasks.length; i++) {
    const [section, title, priority, user, dueIn] = tasks[i];
    const data = {
      v: 0,
      title,
      priority,
      user,
      section: id(12, section),
      position: i,
      dueDateAt: days(dueIn),
      taskStatus: section === 3 ? ("COMPLETE" as const) : ("ACTIVE" as const),
      createdBy: manager.id,
    };
    await prisma.tasks.upsert({ where: { id: id(13, i + 1) }, update: data, create: { id: id(13, i + 1), ...data } });
  }

  const listId = id(14, 1);
  await prisma.crm_TargetLists.upsert({
    where: { id: listId },
    update: {},
    create: { id: listId, name: "Yerevan independent pharmacies 2026", description: "Prospects for GDP training offer", created_by: rep.id },
  });
  const targets = [
    ["Mher", "Hovsepyan", "Alfa Pharmacy Kentron", "Owner"],
    ["Zara", "Melkonyan", "Natali Pharm Arabkir", "Head Pharmacist"],
    ["Edgar", "Ohanyan", "Pharma Plus Malatia", "Manager"],
    ["Knarik", "Babayan", "Green Cross Nor Nork", "Owner"],
    ["Artur", "Zakaryan", "Med Point Davtashen", "Operations Manager"],
  ];
  for (let i = 0; i < targets.length; i++) {
    const [first_name, last_name, company, position] = targets[i];
    const data = {
      first_name,
      last_name,
      company,
      position,
      email: `${first_name}.${last_name}`.toLowerCase() + "@example.am",
      city: "Yerevan",
      country: "Armenia",
      industry: "Pharmacy chain",
      created_by: rep.id,
    };
    await prisma.crm_Targets.upsert({ where: { id: id(15, i + 1) }, update: data, create: { id: id(15, i + 1), ...data } });
  }
  await prisma.targetsToTargetLists.createMany({
    data: targets.map((_, i) => ({ target_id: id(15, i + 1), target_list_id: listId })),
    skipDuplicates: true,
  });

  console.log("Armenian pharma demo data seeded");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
