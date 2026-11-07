import sqlite3
con = sqlite3.connect(r"db/custom.db")
print(con.execute("SELECT code, startDate, endDate, typeof(startDate) FROM Task WHERE code='A-001'").fetchall())
print(con.execute("SELECT COUNT(*) FROM Task WHERE startDate IS NOT NULL AND endDate IS NULL").fetchall())
print(con.execute("SELECT code, startDate, endDate FROM Task WHERE startDate IS NOT NULL LIMIT 3").fetchall())
print(con.execute("SELECT code, startDate FROM Task WHERE startDate IS NULL LIMIT 5").fetchall())
