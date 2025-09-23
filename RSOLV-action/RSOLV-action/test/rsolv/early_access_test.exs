defmodule Rsolv.EarlyAccessTest do
  use Rsolv.DataCase
  alias Rsolv.EarlyAccess
  alias Rsolv.EarlyAccess.Signup

  describe "signups" do
    @valid_attrs %{
      email: "early@example.com",
      name: "John Doe",
      company: "Example Corp",
      referral_source: "hacker_news",
      utm_source: "hn",
      utm_medium: "social",
      utm_campaign: "launch"
    }

    test "create_signup/1 with valid data creates a signup" do
      assert {:ok, %Signup{} = signup} = EarlyAccess.create_signup(@valid_attrs)
      assert signup.email == "early@example.com"
      assert signup.name == "John Doe"
      assert signup.company == "Example Corp"
      assert signup.referral_source == "hacker_news"
      assert signup.utm_source == "hn"
    end

    test "create_signup/1 with duplicate email returns error" do
      {:ok, _} = EarlyAccess.create_signup(@valid_attrs)
      assert {:error, %Ecto.Changeset{}} = EarlyAccess.create_signup(@valid_attrs)
    end

    test "create_signup/1 requires email" do
      attrs = Map.delete(@valid_attrs, :email)
      assert {:error, %Ecto.Changeset{}} = EarlyAccess.create_signup(attrs)
    end

    test "get_signup_by_email/1 returns signup for email" do
      {:ok, signup} = EarlyAccess.create_signup(@valid_attrs)
      found = EarlyAccess.get_signup_by_email("early@example.com")
      assert found.id == signup.id
    end

    test "list_signups/0 returns all signups" do
      {:ok, _} = EarlyAccess.create_signup(@valid_attrs)
      {:ok, _} = EarlyAccess.create_signup(%{@valid_attrs | email: "another@example.com"})
      
      signups = EarlyAccess.list_signups()
      assert length(signups) == 2
    end

    test "count_signups/0 returns total count" do
      assert EarlyAccess.count_signups() == 0
      
      {:ok, _} = EarlyAccess.create_signup(@valid_attrs)
      assert EarlyAccess.count_signups() == 1
    end

    test "list_signups_by_source/1 filters by referral source" do
      {:ok, _} = EarlyAccess.create_signup(@valid_attrs)
      {:ok, _} = EarlyAccess.create_signup(%{@valid_attrs | 
        email: "twitter@example.com",
        referral_source: "twitter"
      })
      
      hn_signups = EarlyAccess.list_signups_by_source("hacker_news")
      assert length(hn_signups) == 1
      assert List.first(hn_signups).referral_source == "hacker_news"
    end

    test "export_to_csv/0 returns CSV of all signups" do
      {:ok, _} = EarlyAccess.create_signup(@valid_attrs)
      {:ok, _} = EarlyAccess.create_signup(%{@valid_attrs | 
        email: "minimal@example.com",
        name: nil,
        company: nil
      })
      
      csv = EarlyAccess.export_to_csv()
      lines = String.split(csv, "\n", trim: true)
      
      assert length(lines) == 3 # header + 2 entries
      assert String.contains?(List.first(lines), "email,name,company,referral_source")
      assert String.contains?(csv, "early@example.com")
      assert String.contains?(csv, "minimal@example.com")
    end

    test "import_from_csv/1 imports signups from CSV data" do
      csv_data = """
      email,name,company,referral_source,utm_source,utm_medium,utm_campaign,signed_up_at
      import1@example.com,Import One,Company A,twitter,tw,social,test,2025-05-27T10:00:00Z
      import2@example.com,Import Two,Company B,direct,,,2025-05-27T11:00:00Z
      """
      
      assert {:ok, results} = EarlyAccess.import_from_csv(csv_data)
      assert results.imported == 2
      assert results.errors == 0
      
      # Verify imports
      signup1 = EarlyAccess.get_signup_by_email("import1@example.com")
      assert signup1.name == "Import One"
      assert signup1.company == "Company A"
      
      signup2 = EarlyAccess.get_signup_by_email("import2@example.com")
      assert signup2.name == "Import Two"
    end
  end
end