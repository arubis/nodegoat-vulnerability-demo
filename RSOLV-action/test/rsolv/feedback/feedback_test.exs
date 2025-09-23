defmodule Rsolv.FeedbackTest do
  use Rsolv.DataCase
  alias Rsolv.Feedback
  alias Rsolv.Feedback.Entry

  describe "feedback entries" do
    @valid_attrs %{
      email: "test@example.com",
      message: "Great product!",
      rating: 5,
      tags: ["ui", "performance"],
      source: "feedback_form"
    }

    test "create_entry/1 with valid data creates a feedback entry" do
      assert {:ok, %Entry{} = entry} = Feedback.create_entry(@valid_attrs)
      assert entry.email == "test@example.com"
      assert entry.message == "Great product!"
      assert entry.rating == 5
      assert entry.tags == ["ui", "performance"]
    end

    test "create_entry/1 with invalid data returns error changeset" do
      assert {:error, %Ecto.Changeset{}} = Feedback.create_entry(%{})
    end

    test "list_entries/0 returns all feedback entries" do
      {:ok, entry1} = Feedback.create_entry(@valid_attrs)
      {:ok, entry2} = Feedback.create_entry(%{@valid_attrs | email: "another@example.com"})
      
      entries = Feedback.list_entries()
      assert length(entries) == 2
      assert Enum.any?(entries, &(&1.id == entry1.id))
      assert Enum.any?(entries, &(&1.id == entry2.id))
    end

    test "get_entry!/1 returns the feedback entry with given id" do
      {:ok, entry} = Feedback.create_entry(@valid_attrs)
      fetched = Feedback.get_entry!(entry.id)
      assert fetched.id == entry.id
      assert fetched.email == entry.email
    end

    test "list_entries_by_email/1 returns entries for specific email" do
      email = "user@example.com"
      {:ok, _entry1} = Feedback.create_entry(%{@valid_attrs | email: email})
      {:ok, _entry2} = Feedback.create_entry(%{@valid_attrs | email: email, message: "Another feedback"})
      {:ok, _other} = Feedback.create_entry(%{@valid_attrs | email: "other@example.com"})
      
      entries = Feedback.list_entries_by_email(email)
      assert length(entries) == 2
      assert Enum.all?(entries, &(&1.email == email))
    end

    test "count_entries/0 returns the total number of entries" do
      assert Feedback.count_entries() == 0
      
      {:ok, _} = Feedback.create_entry(@valid_attrs)
      assert Feedback.count_entries() == 1
      
      {:ok, _} = Feedback.create_entry(%{@valid_attrs | email: "another@example.com"})
      assert Feedback.count_entries() == 2
    end

    test "list_recent_entries/1 returns entries ordered by date" do
      # Insert directly with specific timestamps to ensure ordering
      old_timestamp = ~N[2023-01-01 10:00:00]
      new_timestamp = ~N[2023-01-02 10:00:00]
      
      {:ok, _old_entry} = %Rsolv.Feedback.Entry{}
        |> Rsolv.Feedback.Entry.changeset(@valid_attrs)
        |> Ecto.Changeset.put_change(:inserted_at, old_timestamp)
        |> Ecto.Changeset.put_change(:updated_at, old_timestamp)
        |> Rsolv.Repo.insert()
      
      {:ok, _new_entry} = %Rsolv.Feedback.Entry{}
        |> Rsolv.Feedback.Entry.changeset(%{@valid_attrs | email: "new@example.com"})
        |> Ecto.Changeset.put_change(:inserted_at, new_timestamp)
        |> Ecto.Changeset.put_change(:updated_at, new_timestamp)
        |> Rsolv.Repo.insert()
      
      recent = Feedback.list_recent_entries(10)
      assert length(recent) == 2
      # The newer entry should be first
      assert List.first(recent).email == "new@example.com"
      assert List.last(recent).email == "test@example.com"
    end

    test "export_to_csv/0 returns CSV string of all entries" do
      {:ok, _} = Feedback.create_entry(@valid_attrs)
      {:ok, _} = Feedback.create_entry(%{@valid_attrs | email: "another@example.com", tags: []})
      
      csv = Feedback.export_to_csv()
      lines = String.split(csv, "\n", trim: true)
      
      assert length(lines) == 3 # header + 2 entries
      assert String.contains?(List.first(lines), "email,message,rating,tags,inserted_at")
      assert String.contains?(csv, "test@example.com")
      assert String.contains?(csv, "another@example.com")
    end
  end
end