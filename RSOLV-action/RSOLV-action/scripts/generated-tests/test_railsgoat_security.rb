require 'rails_helper'

RSpec.describe UsersController, type: :controller do
  describe "sql_injection vulnerability tests" do
    context "when vulnerable to sql_injection (RED)" do
      it "should be exploitable with malicious input" do
        # RED: Demonstrate vulnerability exists
        malicious_input = "'; DROP TABLE users; --"
        
        # For SQL injection in Rails controller
        params = { user: { id: malicious_input } }
        
        # This test should pass BEFORE the fix
        expect {
          post :update, params: params
        }.not_to raise_error
        
        # The vulnerability allows SQL injection
        expect(response).to have_http_status(:ok)
      end
    end

    context "when protected against sql_injection (GREEN)" do
      it "should prevent exploitation attempts" do
        # GREEN: Verify fix prevents vulnerability
        malicious_input = "'; DROP TABLE users; --"
        
        # For SQL injection in Rails controller
        params = { user: { id: malicious_input } }
        
        # After fix, this should raise an error or sanitize input
        post :update, params: params
        
        # Either it should return an error or sanitize the input
        expect(response).to have_http_status(:bad_request).or have_http_status(:unprocessable_entity)
      end
    end

    context "when handling valid input (REFACTOR)" do
      it "should maintain normal functionality" do
        # REFACTOR: Ensure functionality is maintained
        valid_input = "validpassword123"
        
        # For normal user update
        params = { user: { id: valid_input } }
        
        post :update, params: params
        
        expect(response).to have_http_status(:ok)
        expect(assigns(:user)).not_to be_nil
      end
    end
  end
end