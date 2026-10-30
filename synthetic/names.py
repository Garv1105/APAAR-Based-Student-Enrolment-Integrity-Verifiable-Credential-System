FIRST_MALE = [
    "Aarav", "Aditya", "Akash", "Amit", "Anil", "Arjun", "Ashok", "Bharath", "Chetan", "Deepak",
    "Dinesh", "Ganesh", "Gaurav", "Harish", "Imran", "Jagdish", "Karthik", "Kiran", "Lokesh", "Mahesh",
    "Manoj", "Mohammed", "Naveen", "Nikhil", "Pradeep", "Prakash", "Rahul", "Rajesh", "Rakesh", "Ramesh",
    "Ravi", "Rohit", "Sachin", "Sandeep", "Santosh", "Shiva", "Srinivas", "Sudhir", "Suresh", "Tarun",
    "Varun", "Venkatesh", "Vijay", "Vikram", "Vinay", "Yash", "Abdul", "Farhan", "Gurpreet", "Harpreet",
    "Joseph", "Thomas", "Anand", "Siddharth", "Pranav", "Hemanth", "Raghav", "Krishna", "Shreyas", "Tejas",
]
FIRST_FEMALE = [
    "Aishwarya", "Ananya", "Anjali", "Aparna", "Asha", "Bhavana", "Chaitra", "Deepa", "Divya", "Fatima",
    "Gayathri", "Geetha", "Harini", "Isha", "Jyothi", "Kavya", "Keerthi", "Lakshmi", "Meena", "Meghana",
    "Neha", "Nikita", "Pooja", "Priya", "Radha", "Rashmi", "Riya", "Sahana", "Sana", "Shalini",
    "Shruti", "Sneha", "Sonia", "Swathi", "Tanvi", "Usha", "Vaishnavi", "Varsha", "Vidya", "Zara",
    "Ayesha", "Mary", "Simran", "Navya", "Pallavi", "Sowmya", "Ramya", "Nandini", "Bhoomika", "Ishita",
]
SURNAMES = [
    "Sharma", "Verma", "Gupta", "Agarwal", "Kumar", "Singh", "Reddy", "Rao", "Naidu", "Iyer",
    "Iyengar", "Nair", "Menon", "Pillai", "Patel", "Shah", "Desai", "Joshi", "Kulkarni", "Deshpande",
    "Patil", "Chaudhary", "Yadav", "Mishra", "Pandey", "Tiwari", "Banerjee", "Chatterjee", "Mukherjee", "Das",
    "Ghosh", "Bose", "Khan", "Ansari", "Qureshi", "Siddiqui", "Fernandes", "DSouza", "Gill", "Sandhu",
    "Hegde", "Shetty", "Gowda", "Bhat", "Kamath", "Murthy", "Prasad", "Varma", "Saxena", "Srivastava",
    "Thakur", "Rathore", "Mehta", "Kapoor", "Malhotra", "Sinha", "Jha", "Mohanty", "Sahu", "Borah",
]

VARIANT_GROUPS = [
    ["Mohammed", "Mohd", "Muhammad", "Mohammad"],
    ["Lakshmi", "Laxmi", "Lakshmy"],
    ["Srinivas", "Shrinivas", "Sreenivas"],
    ["Venkatesh", "Venkatesha", "Venkatesan"],
    ["Chaudhary", "Choudhary", "Chowdhury"],
    ["Agarwal", "Aggarwal", "Agrawal"],
    ["Sharma", "Sarma"],
    ["Karthik", "Kartik", "Karthick"],
    ["Gayathri", "Gayatri"],
    ["Shruti", "Sruthi", "Shruthi"],
    ["Swathi", "Swati"],
    ["Pooja", "Puja"],
    ["Deepak", "Dipak"],
    ["Iyengar", "Ayyangar"],
    ["Bhavana", "Bhavna"],
    ["Ramesh", "Ramesha"],
    ["Pradeep", "Pradip"],
    ["Fernandes", "Fernandez"],
    ["DSouza", "D'Souza", "Dsouza"],
    ["Mukherjee", "Mukherji"],
    ["Shiva", "Siva"],
    ["Vaishnavi", "Vyshnavi"],
]
VARIANT_INDEX = {n: g for g in VARIANT_GROUPS for n in g}

HONORIFICS = ["Mr.", "Ms.", "Kum.", "Sri", "Smt."]

STATES = [
    "Karnataka", "Tamil Nadu", "Maharashtra", "Uttar Pradesh", "Telangana", "Andhra Pradesh", "Kerala",
    "West Bengal", "Gujarat", "Rajasthan", "Madhya Pradesh", "Delhi", "Punjab", "Haryana", "Odisha",
    "Bihar", "Assam", "Jharkhand", "Uttarakhand", "Himachal Pradesh",
]

INST_WORDS_A = ["Sri", "Global", "National", "Vidya", "Gyan", "Saraswati", "Modern", "City", "Royal", "Prakash",
                "Ananta", "Pragati", "Navodaya", "Udaya", "Sapthagiri", "Kaveri", "Ganga", "Narmada", "Shanti", "Jyoti"]
INST_WORDS_B = ["Institute of Technology", "College of Engineering", "Institute of Management",
                "Polytechnic", "Institute of Engineering and Technology", "School of Engineering"]
