defmodule Rsolv.EmailManagementTest do
  use Rsolv.DataCase
  alias Rsolv.EmailManagement
  alias Rsolv.EmailManagement.{Unsubscribe, FailedEmail}

  describe "unsubscribes" do
    @valid_attrs %{
      email: "unsubscribe@example.com",
      reason: "No longer interested"
    }

    test "create_unsubscribe/1 with valid data creates an unsubscribe record" do
      assert {:ok, %Unsubscribe{} = unsub} = EmailManagement.create_unsubscribe(@valid_attrs)
      assert unsub.email == "unsubscribe@example.com"
      assert unsub.reason == "No longer interested"
    end

    test "create_unsubscribe/1 with duplicate email returns error" do
      {:ok, _} = EmailManagement.create_unsubscribe(@valid_attrs)
      assert {:error, %Ecto.Changeset{}} = EmailManagement.create_unsubscribe(@valid_attrs)
    end

    test "is_unsubscribed?/1 returns true for unsubscribed email" do
      email = "test@example.com"
      refute EmailManagement.is_unsubscribed?(email)
      
      {:ok, _} = EmailManagement.create_unsubscribe(%{email: email})
      assert EmailManagement.is_unsubscribed?(email)
    end

    test "list_unsubscribes/0 returns all unsubscribes" do
      {:ok, _} = EmailManagement.create_unsubscribe(@valid_attrs)
      {:ok, _} = EmailManagement.create_unsubscribe(%{email: "another@example.com"})
      
      unsubscribes = EmailManagement.list_unsubscribes()
      assert length(unsubscribes) == 2
    end

    test "export_unsubscribes_to_csv/0 returns CSV of unsubscribes" do
      {:ok, _} = EmailManagement.create_unsubscribe(@valid_attrs)
      {:ok, _} = EmailManagement.create_unsubscribe(%{email: "another@example.com"})
      
      csv = EmailManagement.export_unsubscribes_to_csv()
      lines = String.split(csv, "\n", trim: true)
      
      assert length(lines) == 3 # header + 2 entries
      assert String.contains?(List.first(lines), "email,reason,unsubscribed_at")
      assert String.contains?(csv, "unsubscribe@example.com")
    end
  end

  describe "failed emails" do
    @valid_attrs %{
      to_email: "recipient@example.com",
      subject: "Welcome Email",
      template: "welcome",
      error_message: "Invalid API key",
      email_data: %{
        "from" => "noreply@example.com",
        "body" => "Welcome to our service"
      }
    }

    test "create_failed_email/1 records a failed email" do
      assert {:ok, %FailedEmail{} = failed} = EmailManagement.create_failed_email(@valid_attrs)
      assert failed.to_email == "recipient@example.com"
      assert failed.subject == "Welcome Email"
      assert failed.template == "welcome"
      assert failed.error_message == "Invalid API key"
      assert failed.email_data["from"] == "noreply@example.com"
      assert failed.attempts == 1
    end

    test "list_failed_emails/0 returns all failed emails" do
      {:ok, _} = EmailManagement.create_failed_email(@valid_attrs)
      {:ok, _} = EmailManagement.create_failed_email(%{@valid_attrs | to_email: "another@example.com"})
      
      failed_emails = EmailManagement.list_failed_emails()
      assert length(failed_emails) == 2
    end

    test "list_recent_failed_emails/1 returns recent failures" do
      # Insert directly with specific timestamps to ensure ordering
      old_timestamp = ~N[2023-01-01 10:00:00]
      new_timestamp = ~N[2023-01-02 10:00:00]
      
      {:ok, _old} = %Rsolv.EmailManagement.FailedEmail{}
        |> Rsolv.EmailManagement.FailedEmail.changeset(@valid_attrs)
        |> Ecto.Changeset.put_change(:inserted_at, old_timestamp)
        |> Ecto.Changeset.put_change(:updated_at, old_timestamp)
        |> Rsolv.Repo.insert()
      
      {:ok, _new} = %Rsolv.EmailManagement.FailedEmail{}
        |> Rsolv.EmailManagement.FailedEmail.changeset(%{@valid_attrs | to_email: "new@example.com"})
        |> Ecto.Changeset.put_change(:inserted_at, new_timestamp)
        |> Ecto.Changeset.put_change(:updated_at, new_timestamp)
        |> Rsolv.Repo.insert()
      
      recent = EmailManagement.list_recent_failed_emails(1)
      assert length(recent) == 1
      assert List.first(recent).to_email == "new@example.com"
    end

    test "increment_failed_email_attempts/1 increments the attempt counter" do
      {:ok, failed} = EmailManagement.create_failed_email(@valid_attrs)
      assert failed.attempts == 1
      
      {:ok, updated} = EmailManagement.increment_failed_email_attempts(failed)
      assert updated.attempts == 2
    end
  end
end