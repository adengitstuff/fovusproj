# Fovus App

This is a small demo of a full-stack project made quickly. I used Flowbite Tailwind and React for the front-end, and AWS services
for the backend.

# Approach
The app just takes an input and passes it to S3 directly from the browser. A lambda function is used to generate pre-signed URLS,
and a separate function is used to add data to a dynamoDB Table. Insertions into the table are triggers for a third Lambda function,
which parses data and runs the scripts with essential, minimum error handling. This was a really interesting project and I thank you guys
for the opportunity to work on this! 

# Deployment!

Steps to deploy and run code locally!

This will assume you already have the necessary tools installed:

Node.js + npm: https://nodejs.org

React: https://react.dev/learn/installation

AWS CLI: https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html

AWS CDK: https://docs.aws.amazon.com/cdk/v2/guide/getting_started.html


Step 1: Clone the repo!

	Create or navigate to a directory and run:

	git clone https://github.com/adengitstuff/fovusproj.git

	If everything goes well, move on to step 2:

Step 2: Configure AWS SSO

	Navigate to the backend of the project! cd into project, cd into backend

        If you don't have the AWS Cli, please download: https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html

	Run the command:

		aws configure sso

	Restart console if there's any trouble in this step

	It will ask you for some information. Enter the values here. If they're
		blank, you can just hit enter

			SSO Session Name: (Create any session name)
			SSO start URL: https://d-9a6774ed35.awsapps.com/start
 			SSO region: us-east-2
			SSO registration scopes: (Accept default, just hit enter)

		You'll be taken to a login page to sign in!
		
		Enter these details. Follow the instructions in the browser to confirm
		sign-in.
		
			username: testfovus
			password: Fovus@123

		AWS Cli will then retrieve the AWS accounts you have access to. 
		If you need the accountid to choose, it is: 654654352890
		
			CLI default client Region: us-east-2 or accept
			CLI default output format: (press enter)
			CLI profile name: (Enter any name! I'll use 'Adminaws' for rest of 
				documentation)

		If everything goes well, sign in:

			aws sso login --profile Adminaws 

		replace "Adminaws" with whatever CLI profile name you chose

Step 3: Install AWS CDK and deploy!

	If you do not have AWS cdk, navigate to the project and run

		npm install -g aws-cdk

	Then, navigate to the backend
	run

		npm install

	If that goes well, then deply with:

		aws cdk deploy --profile Adminaws

	replace "Adminaws" with whatever profile name you chose


	** The backend should be deployed! **

Step 4: Deploy frontend

	Navigate to frontend

	Install frontend dependencies with

		npm install

	Once that works, run

		npm start

	To deploy frontend!



 These instructions should deploy and run the app locally! If you wish to also
	test deploy to Amplify, we could install Amplify and run:

amplify pull --appId d2pmm485td5mzr --envName dev

  But it would be missing credentials and aws config file. If you'd like to test
  Amplify deploy, please e-mail me. I can send credentials over!

(Optional) Step 5: Monitor backend

You can log into AWS to view the File Table, Ec2 instances, buckets, and anything else in the project's deployment 
stack.

Log into AWS Backend with: 

    1. Go to aws.amazon.com and click "Sign In"
    2. Click "IAM user" in order to sign in

    It will ask for the following info:

    Account ID: 654654352890
    IAM Username: Fovusteam
    Password: Fovus*123

# Live Demo Steps

I used Amplify to host this as recommended, making sure not to use any backend or frontend Amplify products. Demo can be in 3 steps:

Step 1: Go to Amplify endpoint:

https://dev.d2pmm485td5mzr.amplifyapp.com/

*(Note that there is a Sign-In component there as well. This is just the front-end component; I plan to continue this project and integrate with Cognito for experience with user pools, and included the front-end for now!)


Step 2: Log into AWS Backend. Watch any services and monitor Cloudwatch, DynamoDB Table, S3, EC2, Lambdas, and more:

    1. Go to aws.amazon.com and click "Sign In"
    2. Click "IAM user" in order to sign in

    It will ask for the following info:

    Account ID: 654654352890
    IAM Username: Fovusteam
    Password: Fovus*123

Step 3: You should be able to simply type in input and submit a file

# References

I used a number of references, some of which were videos! I've included them all in the references.txt file

# Demo/Screenshots

Demo is in the /demo folder!

