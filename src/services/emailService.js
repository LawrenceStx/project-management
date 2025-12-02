// src/services/emailService.js

exports.sendTaskAssignmentEmail = async (userEmail, userName, taskName, projectName, dueDate) => {
    const url = "https://api.brevo.com/v3/smtp/email";
    const apiKey = process.env.BREVO_API_KEY; // Must be in .env
    const senderEmail = process.env.BREVO_SENDER_EMAIL; // Must be in .env

    if (!apiKey || !senderEmail) {
        console.error("❌ Brevo Configuration Missing: Check .env for API KEY and SENDER EMAIL");
        return false;
    }

    const data = {
        sender: { name: "Apex Systems Admin", email: senderEmail },
        to: [{ email: userEmail, name: userName }],
        subject: `[Apex] New Task: ${taskName}`,
        htmlContent: `
            <div style="font-family: Arial, sans-serif; padding: 20px; border: 2px solid #ffc107; background-color: #1a1a1a; color: white;">
                <h2 style="color: #ffc107;">🦖 Apex Systems</h2>
                <p>Hi <strong>${userName}</strong>,</p>
                <p>You have been assigned a new task:</p>
                <h3 style="background-color: #333; padding: 10px;">${taskName}</h3>
                <p><strong>Project:</strong> ${projectName}</p>
                <p><strong>Due Date:</strong> ${dueDate}</p>
                <hr style="border-color: #555;">
                <p style="font-size: 12px; color: #888;">Please log in to the dashboard to update status.</p>
            </div>
        `
    };

    try {
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "accept": "application/json",
                "api-key": apiKey,
                "content-type": "application/json"
            },
            body: JSON.stringify(data)
        });

        if (response.ok) {
            const result = await response.json();
            console.log(`✅ Email sent to ${userEmail}. Message ID: ${result.messageId}`);
            return true;
        } else {
            const errorText = await response.text();
            console.error("❌ Brevo API Error:", errorText);
            return false;
        }
    } catch (err) {
        console.error("❌ Network Error sending email:", err);
        return false;
    }
};