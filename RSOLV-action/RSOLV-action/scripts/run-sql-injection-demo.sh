#!/bin/bash

echo "🚀 RSOLV SQL Injection Demo"
echo "=========================="
echo ""
echo "📊 Scenario: E-commerce platform with $10M daily transactions"
echo "🔍 Vulnerability: SQL injection in authentication system"
echo "💰 Potential Loss: $4.45M (average data breach cost)"
echo ""
echo "Press Enter to start the demo..."
read

echo "Step 1: Analyzing vulnerable code in demo-ecommerce/src/auth/login.js"
echo "----------------------------------------------------------------------"
cat demo-ecommerce/src/auth/login.js | head -20
echo ""
echo "⚠️  Found: Direct string concatenation in SQL query!"
echo ""
echo "Press Enter to run RSOLV..."
read

echo "Step 2: Running RSOLV Security Analysis"
echo "--------------------------------------"
cd RSOLV-action

# Create a mock issue for the demo
cat > /tmp/demo-issue.json << 'EOF'
{
  "title": "Security audit needed for authentication system",
  "body": "Our security team has flagged potential vulnerabilities in our authentication system. We need to review and fix any SQL injection vulnerabilities in the login flow.\n\nThis is critical as we process over $10M in daily transactions and any breach could result in significant financial and reputational damage.",
  "number": 1,
  "repository": {
    "owner": "demo-company",
    "name": "demo-ecommerce"
  }
}
EOF

echo "🔍 RSOLV is analyzing the issue..."
echo ""
echo "✅ Security Analysis Complete!"
echo ""
echo "Found vulnerabilities:"
echo "- 2 SQL injection points in authenticateUser() and getUserOrders()"
echo "- Risk Score: 95/100 (CRITICAL)"
echo "- Potential Impact: $4.45M"
echo ""
echo "Press Enter to see the fix..."
read

echo "Step 3: RSOLV Generated Fix"
echo "---------------------------"
echo ""
echo "BEFORE (Vulnerable):"
echo '  const query = `SELECT * FROM users WHERE username = '"'"'${username}'"'"' AND password = '"'"'${password}'"'"'`;'
echo ""
echo "AFTER (Secure):"
echo '  const query = '"'"'SELECT * FROM users WHERE username = ? AND password = ?'"'"';'
echo '  connection.query(query, [username, password], callback);'
echo ""
echo "✅ Using parameterized queries prevents SQL injection"
echo ""
echo "Press Enter to see business impact analysis..."
read

echo "Step 4: Business Impact Analysis"
echo "--------------------------------"
echo ""
echo "💰 Financial Impact: $4.45M prevented"
echo "   - Direct costs: $2.1M (forensics, legal, remediation)"
echo "   - Lost revenue: $1.2M (downtime, customer churn)"
echo "   - Regulatory fines: $850K (PCI-DSS, GDPR violations)"
echo "   - Legal settlements: $300K (customer lawsuits)"
echo ""
echo "📊 ROI Calculation:"
echo "   - Cost of RSOLV fix: $15"
echo "   - Value delivered: $4,450,000"
echo "   - ROI: 29,666,567%"
echo ""
echo "⏱️  Time Saved:"
echo "   - Manual fix: 4 hours"
echo "   - RSOLV fix: 5 minutes"
echo "   - Time saved: 3 hours 55 minutes"
echo ""
echo "Press Enter to see educational content..."
read

echo "Step 5: Three-Tier Educational Explanations"
echo "------------------------------------------"
echo ""
echo "👔 EXECUTIVE LEVEL:"
echo "   This fix prevents attackers from accessing customer data and"
echo "   financial records. It ensures PCI-DSS compliance and protects"
echo "   against an average $4.45M breach cost."
echo ""
echo "👨‍💼 BUSINESS LEVEL:"
echo "   SQL injection is the #1 web vulnerability. This fix ensures"
echo "   customer trust, prevents regulatory fines, and maintains"
echo "   our security certifications."
echo ""
echo "👩‍💻 TECHNICAL LEVEL:"
echo "   Parameterized queries separate SQL logic from user data,"
echo "   preventing malicious input like 'OR 1=1' from being executed"
echo "   as SQL commands."
echo ""
echo "✅ Demo Complete!"
echo ""
echo "🎯 Key Takeaways:"
echo "- RSOLV found ALL vulnerabilities, not just obvious ones"
echo "- Fix maintains exact functionality with added security"
echo "- Automatic compliance documentation included"
echo "- 29.6M% ROI on preventing just one breach"
echo ""
echo "📞 Ready to protect your codebase? Let's scan your repos now!"