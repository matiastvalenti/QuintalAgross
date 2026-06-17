import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.application import MIMEApplication
from .config import settings

def send_email(subject: str, html_body: str, attachments: list = None, to_email: str = None):
    if not (settings.smtp_host and settings.smtp_user and settings.smtp_password and settings.smtp_from):
        return {"sent": False, "reason": "SMTP not configured"}
    
    recipient = to_email or settings.smtp_to
    if not recipient:
        return {"sent": False, "reason": "No recipient email provided"}

    msg = MIMEMultipart()
    msg["Subject"] = subject
    msg["From"] = settings.smtp_from
    msg["To"] = recipient

    msg.attach(MIMEText(html_body, "html", "utf-8"))

    if attachments:
        for attachment in attachments:
            content = attachment['content']
            if hasattr(content, 'read'):
                content.seek(0)
                content = content.read()
            
            part = MIMEApplication(content, Name=attachment['filename'])
            part['Content-Disposition'] = f'attachment; filename="{attachment["filename"]}"'
            msg.attach(part)

    try:
        server = smtplib.SMTP(settings.smtp_host, settings.smtp_port)
        if settings.smtp_use_tls:
            server.starttls()
        server.login(settings.smtp_user, settings.smtp_password)
        server.sendmail(settings.smtp_from, [recipient], msg.as_string())
        server.quit()
        return {"sent": True}
    except Exception as e:
        print(f"SMTP Error: {e}")
        return {"sent": False, "error": str(e)}
