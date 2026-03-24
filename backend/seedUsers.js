'use strict';
require('dotenv').config();
const { hashPassword } = require('./src/crypto/cryptoEngine');
const { v4: uuidv4 }   = require('uuid');
const mysql            = require('mysql2/promise');

const users = [
  { name:'Arjun Kumar',  email:'arjun@example.com',   password:'Arjun@secure123'  },
  { name:'Priya Sharma', email:'priya@example.com',   password:'Priya@secure123'  },
  { name:'Rahul Verma',  email:'rahul@example.com',   password:'Rahul@secure123'  },
  { name:'Sneha Patel',  email:'sneha@example.com',   password:'Sneha@secure123'  },
  { name:'Vikram Singh', email:'vikram@example.com',  password:'Vikram@secure123' },
  { name:'Anjali Nair',  email:'anjali@example.com',  password:'Anjali@secure123' },
  { name:'Karthik Raj',  email:'karthik@example.com', password:'Karthik@secure123'},
  { name:'Divya Menon',  email:'divya@example.com',   password:'Divya@secure123'  },
  { name:'Rohan Gupta',  email:'rohan@example.com',   password:'Rohan@secure123'  },
  { name:'Meera Iyer',   email:'meera@example.com',   password:'Meera@secure123'  },
];

async function seed() {
  console.log('\n🔐 SecureVault — Seeding 10 sample users...\n');
  const pool = mysql.createPool({
    host: process.env.DB_HOST||'localhost', port: process.env.DB_PORT||3306,
    database: process.env.DB_NAME||'ciphercloud',
    user: process.env.DB_USER||'root', password: process.env.DB_PASSWORD||'',
  });
  for (const u of users) {
    try {
      const passwordHash = await hashPassword(u.password);
      await pool.execute(
        `INSERT IGNORE INTO users (userId,email,name,passwordHash,role,plan,storageUsed,storageMax,totpEnabled,verified)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [uuidv4(),u.email,u.name,passwordHash,'user','free',0,5368709120,false,true]
      );
      console.log(`  ✓  ${u.name.padEnd(16)} | ${u.email.padEnd(28)} | ${u.password}`);
    } catch(e) { console.log(`  ✗  ${u.email} — ${e.message}`); }
  }
  console.log('\n✅ Done! All users can now log in.\n');
  await pool.end(); process.exit(0);
}
seed().catch(e => { console.error('Error:', e.message); process.exit(1); });
