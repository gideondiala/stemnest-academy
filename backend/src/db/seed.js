/**
 * StemNest Academy — Database Seed Script
 * Creates all test users from TEST_CREDENTIALS.txt in the real database.
 * Run: npm run seed
 */

require('dotenv').config();
const bcrypt = require('bcrypt');
const pool   = require('../config/db');

const HASH_ROUNDS = 12;

async function seed() {
  console.log('🌱 Seeding database with test users...');
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const users = [
      // Super Admin / Founder
      { name:'Founder',         email:'founder@stemnest.co.uk',      password:'Founder2024!',  role:'super_admin', staff_id:'FOUNDER001' },
      // Admin
      { name:'Admin',           email:'admin@stemnest.co.uk',        password:'admin123',       role:'admin',       staff_id:'ADMIN001'   },
      // Teachers
      { name:'Sarah Rahman',    email:'sarah.rahman@stemnest.co.uk', password:'StemNest2024!', role:'tutor',       staff_id:'CT001'      },
      { name:'James Okafor',    email:'james.okafor@stemnest.co.uk', password:'StemNest2024!', role:'tutor',       staff_id:'MT001'      },
      { name:'Lisa Patel',      email:'lisa.patel@stemnest.co.uk',   password:'StemNest2024!', role:'tutor',       staff_id:'ST001'      },
      { name:'Marcus King',     email:'marcus.king@stemnest.co.uk',  password:'StemNest2024!', role:'tutor',       staff_id:'CT002'      },
      // Sales
      { name:'Alex Johnson',    email:'alex.johnson@stemnest.co.uk', password:'StemNest2024!', role:'sales',       staff_id:'SP001'      },
      // Operations
      { name:'Operations Team', email:'ops@stemnest.co.uk',          password:'StemNest2024!', role:'operations',  staff_id:'OPS001'     },
      // Pre-Sales
      { name:'Pre-Sales Team',  email:'presales@stemnest.co.uk',     password:'StemNest2024!', role:'presales',    staff_id:'PS001'      },
      // Post-Sales
      { name:'Post-Sales Team', email:'postsales@stemnest.co.uk',    password:'StemNest2024!', role:'postsales',   staff_id:'POS001'     },
      // HR
      { name:'HR Team',         email:'hr@stemnest.co.uk',           password:'StemNest2024!', role:'hr',          staff_id:'HR001'      },
    ];

    for (const u of users) {
      const hash = await bcrypt.hash(u.password, HASH_ROUNDS);

      await client.query(
        `INSERT INTO users (name, email, password_hash, role, staff_id, email_verified)
         VALUES ($1, $2, $3, $4, $5, TRUE)
         ON CONFLICT (email) DO UPDATE
           SET name = EXCLUDED.name,
               password_hash = EXCLUDED.password_hash,
               role = EXCLUDED.role,
               staff_id = EXCLUDED.staff_id`,
        [u.name, u.email, hash, u.role, u.staff_id]
      );

      /* Create tutor profile */
      if (u.role === 'tutor') {
        const subjectMap = {
          CT001: { subject:'Coding',   courses:['Python for Beginners','Scratch & Game Design','Web Dev: HTML/CSS/JS'] },
          MT001: { subject:'Maths',    courses:['Primary Maths Boost','GCSE Maths Prep','A-Level Maths Mastery'] },
          ST001: { subject:'Sciences', courses:['GCSE Biology','GCSE Chemistry','A-Level Physics'] },
          CT002: { subject:'Coding',   courses:['Python for Beginners','AI Literacy','A-Level Computer Science'] },
        };
        const profile = subjectMap[u.staff_id] || { subject:'Coding', courses:[] };
        const userRow = await client.query('SELECT id FROM users WHERE email=$1', [u.email]);
        const userId  = userRow.rows[0]?.id;
        if (userId) {
          await client.query(
            `INSERT INTO tutor_profiles (user_id, subject, courses, grade_groups, availability, dbs_checked)
             VALUES ($1, $2, $3, $4, $5, 'yes')
             ON CONFLICT (user_id) DO UPDATE
               SET subject = EXCLUDED.subject, courses = EXCLUDED.courses`,
            [userId, profile.subject, profile.courses, ['Year 7–9','Year 10–11'], 'Mon–Fri, 9am–6pm']
          );
        }
      }

      console.log(`  ✅ ${u.role.padEnd(12)} ${u.email}`);
    }

    await client.query('COMMIT');
    console.log('\n✅ Seed complete! All test users created.');
    console.log('\nTest login: sarah.rahman@stemnest.co.uk / StemNest2024!');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Seed failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
