defmodule Rsolv.EmailOptOutServiceTest do
  use Rsolv.DataCase, async: false
  alias Rsolv.EmailOptOutService
  alias Rsolv.EmailManagement

  setup do
    # Test data
    test_email = "test@example.com"
    
    # Make sure cache is invalidated
    :persistent_term.erase({EmailOptOutService, :unsubscribed_emails})
    
    on_exit(fn -> 
      # Clear cache
      :persistent_term.erase({EmailOptOutService, :unsubscribed_emails})
    end)
    
    %{
      test_email: test_email
    }
  end
  
  describe "ensure_files_exist/0" do
    test "ensures database tables are ready" do
      # This function is now a no-op since we use database
      # but we keep it for backwards compatibility
      assert :ok = EmailOptOutService.ensure_files_exist()
    end
  end
  
  describe "is_unsubscribed?/1" do
    test "returns false for emails not in unsubscribe list", %{test_email: email} do
      # Email is not yet unsubscribed
      refute EmailOptOutService.is_unsubscribed?(email)
    end
    
    test "returns true for emails in unsubscribe list", %{test_email: email} do
      # Add email to unsubscribe database
      {:ok, _} = EmailManagement.create_unsubscribe(%{email: email})
      
      # Should now return true
      assert EmailOptOutService.is_unsubscribed?(email)
    end
    
    test "returns true for emails with failed unsubscribe attempts", %{test_email: email} do
      # Add email to unsubscribes database with a reason indicating failure
      {:ok, _} = EmailManagement.create_unsubscribe(%{
        email: email, 
        reason: "ConvertKit API failure - unsubscribe recorded locally"
      })
      
      # Should now return true
      assert EmailOptOutService.is_unsubscribed?(email)
    end
    
    test "is case insensitive", %{test_email: email} do
      # Add lowercase email to database
      {:ok, _} = EmailManagement.create_unsubscribe(%{email: String.downcase(email)})
      
      # Check with uppercase
      assert EmailOptOutService.is_unsubscribed?(String.upcase(email))
    end
    
    test "handles nil and invalid input" do
      refute EmailOptOutService.is_unsubscribed?(nil)
      refute EmailOptOutService.is_unsubscribed?(:not_an_email)
    end
  end
  
  describe "record_unsubscribe/1" do
    test "adds email to unsubscribe list", %{test_email: email} do
      # Record the unsubscribe
      assert :ok = EmailOptOutService.record_unsubscribe(email)
      
      # Check if added successfully through database
      assert EmailManagement.is_unsubscribed?(email)
    end
    
    test "handles case conversion", %{test_email: email} do
      # Record with uppercase
      assert :ok = EmailOptOutService.record_unsubscribe(String.upcase(email))
      
      # Check with lowercase through database
      assert EmailManagement.is_unsubscribed?(String.downcase(email))
    end
  end
end